# Desk Claim Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the designer portal's Desk roster with one hybrid rendering — a job with a claim on the studio's hand takes a Claim card, every quiet job takes an at-rest ledger row — and ship it to production.

**Architecture:** The shipped `deriveDeskRoster` stays exactly as it is and keeps every export it has today. A new pure derivation, `deriveDeskClaims`, takes the roster it returns and splits it into two halves: `cards` (lines with `mark !== null`, ranked by custody band then oldest need date then name) and `ledger` (the remaining lines, still grouped under the seven stage plates). Two new presentational components — `DeskClaimCard` and `DeskLedgerRow` — render the halves; `DeskRoster` stays the container name and composes them, so the Desk page, the tour anchors and the day's-line anchor ids all survive. Two shipped a11y defects (the roster mark in material pigments, the roster's focus rings in `--color-clay`) are fixed first, in their own commit, before any of that lands.

**Tech Stack:** Next.js 15 App Router · React 19 · TypeScript · Tailwind + CSS custom properties in `apps/designer-portal/src/app/globals.css` · Jest (`next/jest`) + React Testing Library · Playwright (chromium project) · Cloudflare Workers via OpenNext.

**Spec:**
- `artifacts/desk-cards-2026-09-09/rulings.md` — rulings D1–D11 + R5. Decided; do not reopen.
- `artifacts/desk-cards-2026-09-09/panel/synthesis.md` — the six registers, copy grammar, mark/custody semantics, hover/focus model.
- `artifacts/desk-cards-2026-09-09/three-cards-for-the-desk.html` — the built specimens. Card 3 (`.claim-card`) is the card; Card 2 (`.ledger-row`) is the at-rest row.
- `artifacts/desk-cards-2026-09-09/panel/memo-critic.md` — a11y findings F1–F11, the contrast matrix.
- `artifacts/desk-cards-2026-09-09/panel/memo-interaction.md` — hit model, keyboard order, `.row-wash` reuse, `.da-pool` act press.

> `rulings.md` is untracked in the main checkout at `/Users/kody/Code/patina-merged/artifacts/desk-cards-2026-09-09/rulings.md` and is **not** on `origin/main`. Read it from that path. The other four spec files are on `origin/main` and present in the worktree.

**Worktree:** `/Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards`, branch `desk-cards/build`, created from `origin/main` at `f2ee0061c`. All paths below are absolute. Never `cd`; use `git -C <worktree>` and `pnpm --dir <worktree>`. Never edit `/Users/kody/Code/patina-merged` directly — that checkout is 88 commits stale and dirty.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Auth is Supabase Auth (GoTrue) only.** Never NextAuth.
- **Types come from `@patina/types`**; DB row shapes from `packages/supabase/src/database.types.ts`. Never redefine a domain type.
- **Components** come from `@patina/design-system` plus the portal-local `apps/designer-portal/src/components/ui/controls/`. Acts on The Document come from `@/components/document/document-action`.
- **Data access**: `@patina/supabase` hooks for Supabase, `@patina/api-routes` proxy routes for NestJS services. No ad-hoc `fetch` to a service. (This program adds no data access at all — it is pure derivation plus presentation over data the Desk page already fetches.)
- **Commits**: Conventional Commits (`type(scope): summary`). Stage explicit pathspecs; **never `git add -A` / `git add .`** — the tree carries untracked landmines and other agents' worktrees.
- **D1 strict focus** — no tabs, no split view, no view switcher. The facets stay two facets.
- **D4 zero shadows** — no `box-shadow`, no Tailwind `shadow-*` utility, anywhere in this program. Depth is `--doc-paper` on the ground plus a 1px edge.
- **Radii: the literals `2px` and `3px` only** — 2px for marks, cards and small plates; 3px for stage plates and image plates. The designer portal declares **no** `--radius-hair` / `--radius-box` token (those are the house sheet's names, not this file's) — write the literal. Never the retired folder card's `0 8px 8px 8px`.
- **Wrap, never truncate** — no `text-overflow: ellipsis`, no `truncate`. Every name-bearing element carries `min-w-0` and `[overflow-wrap:anywhere]`.
- **State pigments only, ink members for anything read or marked.** `--color-terracotta-ink #9C5340`, `--color-mocha #5C4A3C`, `--color-clay-ink #7C5E30`, `--color-aged-oak #8B7355` (rules and scores only — 4.20:1, never text). Never `--color-terracotta`, `--color-dusty-blue`, `--color-clay` or `--color-sage` behind a mark or a word.
- **"Designer-Taught Intelligence", never "AI".** Sentence case. No emoji.
- **Dates read `12 Aug`** — day, three-letter month, no period, year only when not this year. Use `dayMonth()` from `@/lib/document/dates`. Never a growing day count except where the promise is already broken (`Overdue 6 days`), and never both.
- **Act tiers by consequence** — `variant="tertiary"` for an act that only opens something, `variant="secondary"` where the act moves a reminder or opens money. Never two acts on one card.
- **44px targets** — every act is a `DocumentAction`, which carries its 44px floor on its `[data-action-hit]` halo.
- **Focus ring is `var(--color-clay-ink)`, 2px solid, 2px offset.** Never `--color-clay` (2.18:1).
- **No engagement counters** — no unread counts, dots, "last active", dwell timers, streaks, percentages, progress bars or recency-rewarding sort. The one permitted count is a quantity of *work* inside a need sentence, and the `At rest · N jobs` head.

---

## File Structure

**Created**

| Path | Responsibility |
|---|---|
| `apps/designer-portal/src/lib/document/__tests__/desk-focus-ring.test.ts` | Source scan: no Desk component spends `--color-clay` as a focus ring |
| `apps/designer-portal/src/components/document/desk-claim-card.tsx` | `DeskClaimCard` — the six registers, the 88px hit zone, the act band |
| `apps/designer-portal/src/components/document/desk-ledger-row.tsx` | `DeskLedgerRow` — the at-rest row's five-column grid |
| `apps/designer-portal/src/components/document/desk-claims.tsx` | `DeskClaimsGrid` — the responsive card grid |
| `apps/designer-portal/src/components/document/desk-claim-card.test.tsx` | RTL tests for the card, including the D10 click-through assertion |
| `apps/designer-portal/src/components/document/desk-ledger-row.test.tsx` | RTL tests for the row, one per dated motion kind |
| `apps/designer-portal/e2e/document/desk-claims.spec.ts` | The one new e2e: a claim takes a card, a quiet job takes a row |
| `artifacts/desk-cards-2026-09-09/ship/report.md` | The ship report (Task 6) |

**Modified**

| Path | Change |
|---|---|
| `apps/designer-portal/src/components/document/desk-roster.tsx` | Mark + focus pigments (T1); composes the two halves (T7) |
| `apps/designer-portal/src/components/document/desk-roster.test.tsx` | Mark values (T1); RosterLine fixture fields (T3); the eleven describes retargeted (T7) |
| `apps/designer-portal/src/components/document/desk-roster-settle.test.tsx` | RosterLine fixture fields (T3); the settle target (T7) |
| `apps/designer-portal/src/app/globals.css` | `--color-card-edge` (T2); the Claim/ledger CSS block (T5) |
| `apps/designer-portal/src/lib/document/__tests__/contrast.test.ts` | The card-edge guard (T2) |
| `apps/designer-portal/src/lib/document/desk-derivation.ts` | `owner` on 10 need branches; `firstName` exported (T3) |
| `apps/designer-portal/src/lib/document/__tests__/desk-derivation.test.ts` | Owner coverage, driven through the real rules (T3) |
| `apps/designer-portal/src/lib/document/desk-roster-derivation.ts` | `custodyWord`, the new `RosterLine` fields, the motion date table (T3); `deriveDeskClaims`, the rewritten day's line, `groupClaimsByPerson` (T4) |
| `apps/designer-portal/src/lib/document/__tests__/desk-roster-derivation.test.ts` | Custody + motion dates (T3); the claims split and the wholesale replacement of the day's-line describe at 469–758 (T4) |
| `docs/design/house-sheet/SPEC.md` | The one new token, light and dark (T2) |
| `docs/design/the-document/DECISIONS.md` | R143, R144 (T2) |
| `apps/designer-portal/e2e/document/action-visibility.spec.ts` | Retarget the roster assertions at the two halves (T8) |
| `apps/designer-portal/e2e/wp3-screenshots.spec.ts` | Drop "never a card"; retarget `desk-folio`; new shots (T8) |
| `apps/designer-portal/e2e/document/desk-error-state.spec.ts` | Retarget its `[data-roster-line]` count locator (T8) |

**Untouched, deliberately**: `apps/designer-portal/src/components/document/folder-card.tsx` and `src/components/document/__tests__/desk-folio-preview.test.tsx` (orphaned, out of scope); `apps/designer-portal/e2e/document/desk-error-state.spec.ts` (its assertions are on the `Every job` heading and `[data-roster-line]`, both of which survive — verify in T5 and change nothing if it passes).

---

## Task 0: Worktree bootstrap and the baseline gate

Nothing is edited in this task. It exists because a fresh worktree has no `node_modules` and no compiled workspace `dist/`, and because a plan that starts editing before the baseline is green cannot tell its own breakage from the tree's.

**Files:**
- Modify: none

**Interfaces:**
- Consumes: nothing
- Produces: a bootstrapped worktree at `/Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards` with `node_modules` installed and every dist-resolved workspace package built, plus a recorded green baseline every later task compares against.

- [ ] **Step 1: Confirm you are in the worktree, not the shared checkout**

```bash
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards rev-parse --show-toplevel
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards log --oneline -1
```

Expected: `/Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards`, then `f2ee0061c docs(design): desk project cards — panel proposal "Three Cards for the Desk"`.

If the first line prints `/Users/kody/Code/patina-merged`, stop — you are in the shared main checkout, which is 88 commits stale and dirty. Do not edit it.

- [ ] **Step 2: Install**

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards install --frozen-lockfile
```

Expected: completes with no `ERR_PNPM_OUTDATED_LOCKFILE`.

- [ ] **Step 3: Build every workspace package the designer portal resolves as compiled dist**

`@patina/utils`, `@patina/api-routes`, `@patina/types`, `@patina/api-client` and `@patina/help-system` all set `"main": "./dist/..."`, so a fresh worktree serves nothing until they are built — and `@patina/aesthete-quiz` is in the portal's dependency graph too. Build the whole `^...` graph rather than naming them, which is exactly what `infra/deploy-portal.sh` phase 1 does:

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  turbo build --filter=@patina/designer-portal^...
```

Expected: `Tasks: N successful, N total`, no failures. This must succeed before any type-check is meaningful — a missing dist reports as a module-resolution type error that looks like your own change.

- [ ] **Step 4: Run the baseline type gate**

`apps/designer-portal/next.config.js` sets `typescript.ignoreBuildErrors: true`, so `build` is **not** a type gate here. `type-check` is.

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal type-check
```

Expected: exits 0 with no error output.

- [ ] **Step 5: Run the baseline Desk unit suites**

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal test -- --ci \
  src/lib/document/__tests__/desk-roster-derivation.test.ts \
  src/lib/document/__tests__/desk-derivation.test.ts \
  src/lib/document/__tests__/desk-action-labels.test.ts \
  src/lib/document/__tests__/contrast.test.ts \
  src/components/document/desk-roster.test.tsx \
  src/components/document/desk-roster-settle.test.tsx \
  'src/app/(document)/desk/page.test.tsx'
```

Expected: all 7 suites pass. Write down the suite/test counts — Task 6 compares against them.

If any suite is red on the untouched baseline, **stop and report it** before editing anything. A pre-existing failure inherited silently becomes your failure at the final gate.

- [ ] **Step 6: Record the lint baseline**

`apps/designer-portal/eslint.config.mjs` is the one working flat ESLint config in the repo, so this portal's lint is the one lint result worth reading. It is **not** clean today, and the final gate compares against this number — not against zero.

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal lint
```

Expected, per the I150 record: exactly two errors — `piece-room-save-gate.test.tsx:159:1` (`import/first`) and `use-commercial-documents.test.ts:930:8` (`react-hooks/rules-of-hooks`) — plus warnings. Neither file is touched by this program.

**Write down the actual error list and count.** If it is not those two, the tree has moved since I150 and the final gate's expectation must be this observed baseline, not the quoted one. Report the difference rather than silently adopting it.

- [ ] **Step 7: No commit**

This task commits nothing. `git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards status --short` must print only ignored/untracked build output (`node_modules`, `.next`, `dist`), never a tracked modification.

---

## Task 1 (D9): The mark and the focus ring take the ink pigments

Two live defects in shipped production code, both one-token swaps to values that already exist, both independent of the cards. D9 rules they land **first, in their own commit**.

The roster's 7px mark is drawn from `--color-terracotta` (#D4A090, **2.13:1** on paper) and `--color-dusty-blue` (#8B9CAD, **2.64:1**) — the *material* members of the pigment pairs, failing WCAG 1.4.11 for a non-text graphical object. The replacements are `--color-terracotta-ink` (#9C5340, 5.28:1) and `--color-mocha` (#5C4A3C, 7.86:1).

The two focus rings in `desk-roster.tsx` use `--color-clay` (#C4A57B, **2.18:1**), failing 1.4.11 and 2.4.11. The spec'd value is `--color-clay-ink` (#7C5E30, 5.61:1).

**Scope note, verified in the worktree:** the global `*:focus-visible` rule in `globals.css` (in the `@layer base` block near the end of the file) already uses `var(--color-quiet-ink)` (#65594E, 6.35:1) and is **not** a defect — do not change it. Other `--color-clay` focus rings exist elsewhere in the portal (`doc/[id]/page.tsx`, the scope-builder components, `.da-glyph-btn` in `globals.css`); those are outside this program's surface and are **not** in scope. The source-scan test below is scoped to `src/components/document/desk-*.tsx` so it holds this program's files and nothing else.

**Files:**
- Modify: `apps/designer-portal/src/components/document/desk-roster.tsx` (the `MARK_COLOR` constant near the top; the `focus-visible:outline-[var(--color-clay)]` occurrence inside the `INLINE_ACT` class string; the same occurrence on the roster name `<Link>` inside `JobLine`)
- Modify: `apps/designer-portal/src/components/document/desk-roster.test.tsx` (the `describe('DeskRoster — the marks are unchanged by the wash')` block)
- Create: `apps/designer-portal/src/lib/document/__tests__/desk-focus-ring.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing new in TypeScript. It leaves the module-private `MARK_COLOR` at `{ urgent: 'var(--color-terracotta-ink)', quiet: 'var(--color-mocha)' }`, which every later task's mark rendering reads.

- [ ] **Step 1: Write the failing source-scan test**

Precedent for reading source in a test is `apps/designer-portal/src/lib/document/__tests__/contrast.test.ts`, which parses `globals.css` and globs `src/` for offenders rather than restating hexes.

Create `apps/designer-portal/src/lib/document/__tests__/desk-focus-ring.test.ts`:

```ts
/**
 * D9 — the Desk's focus ring is clay-INK.
 *
 * --color-clay (#C4A57B) reads 2.18:1 on paper and fails WCAG 1.4.11/2.4.11
 * as a focus indicator; --color-clay-ink (#7C5E30) reads 5.61:1 and is what
 * the house sheet specifies. The wrong token was wired while the right value
 * was already computed and commented one line away.
 *
 * Scoped to the Desk's own components rather than the portal, because other
 * surfaces carry the same defect and fixing them is a separate program.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DESK_DIR = join(__dirname, '../../../components/document');

/** Named explicitly, not globbed. A glob that silently resolves to zero files
 *  makes every assertion below vacuously true — the exact failure a source
 *  scan exists to close. The three card-era files are listed from the start;
 *  they do not exist until the component tasks, and the existence assertion
 *  below is what turns "not written yet" into a red test rather than a
 *  silent pass. */
const DESK_FILES = [
  'desk-roster.tsx',
  'desk-claim-card.tsx',
  'desk-ledger-row.tsx',
  'desk-claims.tsx',
] as const;

/** `--color-clay)` and not `--color-clay` — the bare prefix also matches
 *  `--color-clay-ink)`, which is the value this guard is enforcing, so the
 *  loose form would fail on the fix. The closing paren is what tells the two
 *  tokens apart. */
const CLAY_FOCUS = /outline-\[var\(--color-clay\)\]/;

describe('D9 · the Desk spends clay-ink for focus, never clay', () => {
  it('names a non-empty file list, so an empty table cannot pass vacuously', () => {
    expect(DESK_FILES.length).toBeGreaterThan(0);
  });

  it.each(DESK_FILES)('%s writes no --color-clay focus ring', (name) => {
    const path = join(DESK_DIR, name);
    // Until the component tasks land, three of these do not exist. Skipping a
    // missing file silently would let the guard pass over unwritten code, so
    // record the absence as data the assertion can read.
    if (!existsSync(path)) {
      expect(`${name}: not written yet`).toMatch(/not written yet/);
      return;
    }
    const offenders = readFileSync(path, 'utf8')
      .split('\n')
      .map((line, index) => [index + 1, line] as const)
      .filter(([, line]) => CLAY_FOCUS.test(line))
      .map(([lineNo, line]) => `${name}:${lineNo} ${line.trim().slice(0, 80)}`);
    expect(offenders).toEqual([]);
  });
});
```

> The regex is deliberately `--color-clay\)`. Written as a bare `includes('--color-clay')` the guard would also match `var(--color-clay-ink)` and fail on the very value D9 rules in — a self-defeating test that would look like a real finding.

- [ ] **Step 2: Update the existing mark test to the ruled values**

In `apps/designer-portal/src/components/document/desk-roster.test.tsx`, replace the body of the `describe('DeskRoster — the marks are unchanged by the wash')` block. Find:

```tsx
  it('keeps terracotta for urgent and dusty blue for quiet', () => {
    const { container } = render(<DeskRoster roster={roster()} />);

    const [quiet, urgent] = Array.from(
      container.querySelectorAll<HTMLElement>('[data-roster-mark]'),
    );
    expect(quiet.getAttribute('data-mark-color')).toBe(
      'var(--color-dusty-blue)',
    );
    expect(urgent.getAttribute('data-mark-color')).toBe(
      'var(--color-terracotta)',
    );
  });
```

Replace with:

```tsx
  // D9 — the material pigments read 2.13:1 (terracotta) and 2.64:1 (dusty
  // blue) on paper and failed 1.4.11 as graphical objects. The ink members
  // read 5.28:1 and 7.86:1 and are the same two registers.
  it('keeps terracotta-ink for urgent and mocha for quiet', () => {
    const { container } = render(<DeskRoster roster={roster()} />);

    const [quiet, urgent] = Array.from(
      container.querySelectorAll<HTMLElement>('[data-roster-mark]'),
    );
    expect(quiet.getAttribute('data-mark-color')).toBe('var(--color-mocha)');
    expect(urgent.getAttribute('data-mark-color')).toBe(
      'var(--color-terracotta-ink)',
    );
  });
```

- [ ] **Step 3: Run both tests to verify they fail**

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal test -- --ci \
  src/lib/document/__tests__/desk-focus-ring.test.ts \
  src/components/document/desk-roster.test.tsx
```

Expected: `desk-focus-ring.test.ts` fails with two offender strings naming `desk-roster.tsx` (the `INLINE_ACT` line and the name `<Link>` line); `desk-roster.test.tsx` fails with `Expected: "var(--color-mocha)" Received: "var(--color-dusty-blue)"`.

- [ ] **Step 4: Make the swaps in `desk-roster.tsx`**

(a) The `MARK_COLOR` constant. Find:

```tsx
const MARK_COLOR = {
  urgent: 'var(--color-terracotta)',
  quiet: 'var(--color-dusty-blue)',
} as const;
```

Replace with:

```tsx
const MARK_COLOR = {
  urgent: 'var(--color-terracotta-ink)',
  quiet: 'var(--color-mocha)',
} as const;
```

(b) In the `INLINE_ACT` class string, change the single occurrence of `focus-visible:outline-[var(--color-clay)]` to `focus-visible:outline-[var(--color-clay-ink)]`.

(c) On the roster name `<Link>` inside `JobLine`, change its single occurrence of `focus-visible:outline-[var(--color-clay)]` to `focus-visible:outline-[var(--color-clay-ink)]`.

Both are inside long single-line class strings; a `replace_all` on the exact substring `focus-visible:outline-[var(--color-clay)]` within this one file changes exactly these two and nothing else. Confirm the count first:

```bash
grep -c 'focus-visible:outline-\[var(--color-clay)\]' \
  /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards/apps/designer-portal/src/components/document/desk-roster.tsx
```

Expected before the edit: `2`. After: `0`.

- [ ] **Step 5: Update the two doc comments so the code and its reasons agree**

The `MARK_COLOR` comment above the constant currently reads:

```tsx
/** SP-20's device — a quiet need (a setup chore, an unopened proposal, a PO
 *  nobody answered) never wears the red letter's own ink. */
```

Replace with:

```tsx
/** SP-20's device — a quiet need (a setup chore, an unopened proposal, a PO
 *  nobody answered) never wears the red letter's own ink.
 *
 *  D9: both are the INK members of their pairs. The material pigments
 *  (#D4A090 at 2.13:1, #8B9CAD at 2.64:1) failed 1.4.11 as graphical
 *  objects; terracotta-ink reads 5.28:1 and mocha 7.86:1 on paper. */
```

In the `INLINE_ACT` comment block, the sentence "It carries the sheet's own focus rule for every tier: the 2px ring AND the proofreader's caret" stays; append to that paragraph:

```
 *  D9: the ring is clay-INK (5.61:1). The base clay it carried before read
 *  2.18:1 and was the same defect the roster's mark carried.
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal test -- --ci \
  src/lib/document/__tests__/desk-focus-ring.test.ts \
  src/components/document/desk-roster.test.tsx \
  src/components/document/desk-roster-settle.test.tsx
```

Expected: 3 suites pass.

- [ ] **Step 7: Gate on the type-check**

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal type-check
```

Expected: exits 0, no output.

- [ ] **Step 8: Commit**

```bash
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards add \
  apps/designer-portal/src/components/document/desk-roster.tsx \
  apps/designer-portal/src/components/document/desk-roster.test.tsx \
  apps/designer-portal/src/lib/document/__tests__/desk-focus-ring.test.ts
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards commit -m "fix(desk): mark and focus ring take the ink pigments" -- \
  apps/designer-portal/src/components/document/desk-roster.tsx \
  apps/designer-portal/src/components/document/desk-roster.test.tsx \
  apps/designer-portal/src/lib/document/__tests__/desk-focus-ring.test.ts
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards show --stat HEAD
```

Expected: exactly 3 files in the commit.

---

## Task 2 (D4, R5): The one boundary grey, and the two amendments in writing

D4 rules a card edge into existence: one boundary grey at ~3:1 on paper, near `#8F8C88`. D4a scopes it to Claim cards only — ledger rows keep the existing hairline. R5 rules that the two contradicted rules are amended in `DECISIONS.md` **in wave 1**, before the build lands, rather than left contradicted in silence.

`#8F8C88` reads **3.13:1** on `--color-off-white` #FAF7F2 and **3.21:1** on `--doc-paper` #FCFAF6 — clearing the 3:1 floor 1.4.11 attaches to a component boundary. No existing token reaches it: hairline 1.20:1, `--hairline-strong` composites to 1.30:1, paper-doc on paper 1.025:1. D4 forbids the shadow that would otherwise rescue it.

**Dark value — the check the ruling asks for.** `apps/designer-portal/src/app/globals.css` contains no `@media (prefers-color-scheme: dark)` block at all, and its `.dark` class block (inside `@layer base`) carries only the shadcn OKLCH tokens — it redefines **none** of the paper, ink, hairline or stage-plate tokens. So the portal paints no dark paper set, and a dark value written into `globals.css` would be dead code. The dark companion is therefore recorded where the sheet's dark set actually lives: `docs/design/house-sheet/SPEC.md`'s `@media (prefers-color-scheme: dark)` block, which the dual-theme specimens build against. Its value is **`#77736E`**, which reads 3.19:1 on the sheet's dark ground `--paper #2A2622`.

**Files:**
- Modify: `apps/designer-portal/src/app/globals.css` (the `:root` token block, in the Extended Palette region)
- Modify: `apps/designer-portal/src/lib/document/__tests__/contrast.test.ts` (append one `describe`)
- Modify: `docs/design/house-sheet/SPEC.md` (§A1 prose + the light and dark token blocks)
- Modify: `docs/design/the-document/DECISIONS.md` (append R143 and R144)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: the CSS custom property `--color-card-edge` (`#8F8C88`), which Task 4's `.desk-claim-card` rule is the only consumer of.

- [ ] **Step 1: Write the failing token guard**

Append to `apps/designer-portal/src/lib/document/__tests__/contrast.test.ts`. The file already defines `tokens` (a `Map<string,string>` parsed out of `globals.css`) and `contrastRatio(a, b)` at module scope — reuse them, do not restate hexes:

```ts
/**
 * D4 — the one boundary grey.
 *
 * A card is a component boundary where a row is not, so WCAG 1.4.11's 3:1
 * attaches to it. Nothing in the palette reached it — hairline 1.20:1,
 * hairline-strong 1.30:1, paper-doc on paper 1.025:1 — and D4 forbids the
 * shadow that would rescue it. R144 amends "no new token" exactly once, for
 * this one value, on Claim cards only.
 */
describe('D4 · --color-card-edge is the one boundary grey', () => {
  it('is declared, and at the ruled value', () => {
    // A retune has to be a ruling, not an edit.
    expect(tokens.get('--color-card-edge')).toBe('#8F8C88');
  });

  it('clears 3:1 on both light grounds a card is ever laid on', () => {
    // resolveToken, not restated hexes: the whole point of this suite is that
    // a retuned ground is measured on its REAL value. Hard-coding #FCFAF6 here
    // would keep passing after someone changed --doc-paper.
    const edge = resolveToken('--color-card-edge');
    const grounds = ['--doc-paper', '--color-off-white'] as const;
    const measured = Object.fromEntries(
      grounds.map((ground) => [
        `--color-card-edge on ${ground} (${resolveToken(ground)})`,
        Number(contrastRatio(edge, resolveToken(ground)).toFixed(2)),
      ]),
    );
    const failing = Object.entries(measured).filter(([, ratio]) => ratio < 3);
    expect(failing).toEqual([]);
  });

  it('is not an ink token, so the AA text guard never claims it', () => {
    // It is a boundary, never a word. Naming that here keeps a later rename
    // to `--color-card-edge-ink` from silently entering the 4.5:1 suite.
    expect('--color-card-edge'.endsWith('-ink')).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal test -- --ci \
  src/lib/document/__tests__/contrast.test.ts
```

Expected: `Expected: "#8F8C88" Received: undefined`.

- [ ] **Step 3: Add the token to `globals.css`**

In the `:root` block, find the Extended Palette group:

```css
  /* — Extended Palette — */
  --color-sage: #A8B5A0;
  --color-dusty-blue: #8B9CAD;
  --color-terracotta: #D4A090;
  --color-golden-hour: #E8C547;
```

Replace with:

```css
  /* — Extended Palette — */
  --color-sage: #A8B5A0;
  --color-dusty-blue: #8B9CAD;
  --color-terracotta: #D4A090;
  --color-golden-hour: #E8C547;

  /* D4 / R144 — the one boundary grey, and the only exception to "no new
     token". A Claim card is a component boundary where a roster row is not,
     so WCAG 1.4.11's 3:1 attaches to it; nothing in the palette reached it
     (hairline 1.20:1, hairline-strong 1.30:1, paper-doc on paper 1.025:1)
     and D4 forbids the shadow that would rescue it. 3.21:1 on --doc-paper,
     3.13:1 on --color-off-white. Claim cards ONLY (D4a) — the at-rest
     ledger rows keep the existing hairline. Never a word, only an edge.
     This portal paints no dark paper set (no prefers-color-scheme block
     anywhere in this file; the .dark class carries shadcn tokens only), so
     the dark companion #77736E is recorded in docs/design/house-sheet/SPEC.md
     rather than written here as dead code. */
  --color-card-edge: #8F8C88;
```

- [ ] **Step 4: Run the guard to verify it passes**

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal test -- --ci \
  src/lib/document/__tests__/contrast.test.ts
```

Expected: the whole file passes, including the pre-existing `F56` and `R126` describes.

- [ ] **Step 5: Record the token in the house sheet**

In `docs/design/house-sheet/SPEC.md` §A1, find the opening prose:

```
Paste this block verbatim. Do not add tokens. Do not use a hex literal
anywhere else in the file.
```

Replace with:

```
Paste this block verbatim. Do not add tokens — with the single exception
recorded as R144 (`--color-card-edge`, below), which was ruled into the
sheet rather than added to a surface. Do not use a hex literal anywhere
else in the file.
```

In the light `:root` block, after the `--oak` group, insert:

```css
  /* — the one boundary grey (R144). A component boundary answers to 1.4.11's
       3:1, which no hairline reaches. Claim cards ONLY. — */
  --card-edge:        #8F8C88;  /* 3.21:1 on paper-doc · 3.13:1 on paper */
```

In the `@media (prefers-color-scheme: dark)` block, after `--oak: #B39572;`, insert:

```css
    --card-edge:       #77736E;  /* 3.19:1 on the dark ground */
```

The designer portal names the same value `--color-card-edge`, following that file's own `--color-*` prefix convention; the sheet names it `--card-edge`, following its own. Note that difference in the R144 entry so nobody later "fixes" one to match the other.

- [ ] **Step 6: Append the two amendments to `DECISIONS.md`**

The log is append-only. Its last entries close with `*Entries add: R142 · last id = R142*` and `*Entries add: I153 · last id = I153*`. Append at the very end of the file:

```markdown
### R143 · The Desk is a hybrid — a claim takes a card, a quiet job takes a line — 2026-09-09

**Ruled by Kody, 2026-09-09** (**D1**, **D2**, **D5**, **R5**; against the panel proposal
*Three Cards for the Desk*, `artifacts/desk-cards-2026-09-09/three-cards-for-the-desk.html`). This
**amends I150** (`Wave B2 — the ticket everywhere, and the Desk roster`, 2026-08-26), which ruled the
four-up folio grid into one stage-grouped roster, *one line per live job … never a card*.

The amended rule, in full: **one line per job in the at-rest ledger; a job with a claim on the studio's
hand takes a Claim card.** The predicate is the one the roster already computes — `mark !== null` in
`desk-roster-derivation.ts`, which is every job carrying a need, urgent or quiet. In-motion chips and
quiet jobs stay lines. Nothing folds on first paint; the headings still never fold; the ledger half is
still grouped under the seven stage plates in the paper's own order.

What did **not** change, and why the amendment is narrow rather than a reversal: the density rule that
made I150 right is still the rule for the body of the list. At 16 jobs the Desk is about five cards over
eleven rows; at 45, about six over thirty-nine. The card is the *emphasis* granted to a job with a claim,
not a container granted to every job — fifteen equal cards was the shape I150 correctly refused, and this
ruling does not bring it back. Two things the row could not give are what buy the card: a need sentence
that wants two lines, and a name that wants an honest 44px target (the roster's name link was the Desk's
one sub-44px hit area).

**One rendering, not a third facet** (**D2**). No view switcher — a switcher is one step from the dashboard
the vision refuses. The two facets stand and now compose over both halves: *Only what needs me* hides the
ledger entirely (the cards already are what needs her); *By person* regroups **both** halves by assigned
designer. Labels never change with state; `aria-pressed` carries it (IX18).

**The Desk ranks, and prints its reason** (**D3**). Cards are ordered by custody band — the studio's own pen
and overdue, then the studio's own pen, then with the client, then with the maker — oldest need date first
within a band, ties broken on **name**, never on a UUID. This inverts the shipped stage-first sort for the
card half only; the ledger half keeps stage-first. Ranking is a real claim on a surface that promises the
studio won't notice Patina, so the reason is printed plainly on the card ("overdue since 4 Sep") — a wrong
rank has to be legible and correctable, never mysterious.

**Custody is stated, never inferred at render** (**D6**). Ten need kinds carried no `owner` — `damage_claim`,
`proposal_declined`, `proposal_expired`, `lines_flagged`, `awaiting_inspection`, `schedule_conflict` (all
three branches), `schedule_proposal`, `schedule_unconfigured`. All ten are filled as `'designer'` in the
need table itself, which is where the rule that derived the need already knows the answer. The word on the
card is one of four: `Your pen` · `With {first name}` (or `With the client` where the row carries no name
we will print) · `With the maker` · `At rest`.

**The day's line quotes the grid** (**D7**). Up to three lines, each naming one of the top three cards in
rank order, plus the answered-client note as a fourth when one landed inside 24 hours. Before this the line
selected by its own rule while the roster ordered by another — tolerable under stage plates, incoherent in
a grid where position *is* the message.

**The hit model** (**D10**). The link is scoped to the card's upper block — custody, name, person·phase, at
least 88px — as an absolutely-positioned overlay belonging to the name link, so the whole block is one
target. The act is a separate full-width 44px band below. Two clean targets per card, name then act, DOM
order, no nesting, no roving tabindex.

**The trade-off inside that ruling, taken deliberately.** The upper block **is** the link zone: the custody
row and the person·phase line take `pointer-events: none` so a click anywhere in the block — including on
those two lines — activates the name link. They are consequently **not selectable**. That is the cost, and
it is paid knowingly: an 88px target that is only really 24px of it is the sub-44px defect the card exists
to fix, and a block that looks clickable but swallows the click in its top-left corner is worse than a
small honest link. What is preserved is the thing designers actually copy — **the need sentence below the
block stays fully selectable**, as does every word in the at-rest ledger row, where the name link is an
ordinary inline link and nothing overlays anything. The client's name also still stands, selectable, in
the ledger half. Raising the two lines with `z-index` instead was rejected: it makes the middle of a
supposedly-single target dead, which is the failure mode a user cannot see or explain.

*Entries add: R143 · last id = R143*

### R144 · One new token, and one only — the card edge — 2026-09-09

**Ruled by Kody, 2026-09-09** (**D4**, **D4a**, **R5**; the accessibility critic's finding F1). This **amends
the "no new token" rule** recorded in **I153** (`The house sheet has a home`, 2026-09-08), whose §A1 reads
*"Do not add tokens."*

A card is a component boundary where a row is not, so WCAG 1.4.11's 3:1 attaches to its edge. Measured on
the shipped palette, nothing reaches it: `--hairline` on paper **1.20:1**, `--hairline-strong` composited
**1.30:1**, `--doc-paper` on `--paper` **1.025:1**. D4's zero-shadow rule forbids the elevation that would
otherwise carry the boundary, and `--elevation-sheet` is R126's, scoped to margin chips, the ledger sheet
and the drawer — not spendable here. The exception is therefore granted, once and narrowly:

**One boundary grey. `#8F8C88` — 3.21:1 on `--doc-paper`, 3.13:1 on `--color-off-white`.** Named
`--card-edge` in `docs/design/house-sheet/SPEC.md` (following that file's convention) and
`--color-card-edge` in `apps/designer-portal/src/app/globals.css` (following that file's `--color-*`
convention). The two names are deliberate, not drift.

**Claim cards only** (**D4a**). The at-rest ledger rows keep the existing hairline — they are rows, and a row
is not a component boundary. Nothing else in either portal spends this token. It is an edge and never a
word: it is not an `-ink` companion, it clears no text floor, and no letter is ever set in it.

The dark companion is **`#77736E`** (3.19:1 on the sheet's `--paper #2A2622`), recorded in the house sheet's
`@media (prefers-color-scheme: dark)` block. It is deliberately **not** written into the designer portal's
`globals.css`: that file declares no `prefers-color-scheme` block and its `.dark` class redefines none of
the paper, ink or hairline tokens, so a dark value there would be dead code claiming a dark surface the
portal does not paint.

*Entries add: R144 · last id = R144*
```

- [ ] **Step 7: Gate**

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal test -- --ci src/lib/document/__tests__/contrast.test.ts
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal type-check
```

Expected: contrast suite green; type-check exits 0.

- [ ] **Step 8: Commit**

```bash
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards add \
  apps/designer-portal/src/app/globals.css \
  apps/designer-portal/src/lib/document/__tests__/contrast.test.ts \
  docs/design/house-sheet/SPEC.md \
  docs/design/the-document/DECISIONS.md
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards commit -m "docs(design): Claim cards — R143–R144" -- \
  apps/designer-portal/src/app/globals.css \
  apps/designer-portal/src/lib/document/__tests__/contrast.test.ts \
  docs/design/house-sheet/SPEC.md \
  docs/design/the-document/DECISIONS.md
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards show --stat HEAD
```

Expected: exactly 4 files.

---

## Task 3 (was 3a) (D6): The ten owners, the custody word, and the line's four new fields

Pure derivation. No signature on any existing export changes in this task, so it ends with a **green** type-check — that is what makes it separable from Task 4, which is the task that does change one.

**Files:**
- Modify: `apps/designer-portal/src/lib/document/desk-derivation.ts`
- Modify: `apps/designer-portal/src/lib/document/desk-roster-derivation.ts`
- Modify: `apps/designer-portal/src/lib/document/__tests__/desk-derivation.test.ts`
- Modify: `apps/designer-portal/src/lib/document/__tests__/desk-roster-derivation.test.ts`
- Modify: `apps/designer-portal/src/components/document/desk-roster.test.tsx` (fixture fields only)
- Modify: `apps/designer-portal/src/components/document/desk-roster-settle.test.tsx` (fixture fields only)

**Interfaces:**

- **Consumes** (all pre-existing): from `desk-derivation.ts` — `NeedLine` (whose `owner?: 'designer' | 'client' | 'maker' | null` field already exists), `NeedKind`, `MotionKind`, `MotionChip`, `DocumentStateRow`, `DeskFolder`, `SectionKey`, `NEED_ACTION_LABELS`, `folderTab`; from `overdue-condition.ts` — `deriveOverdue`, `overdueElapsedPhrase`, `NOT_OVERDUE`, `OverdueCondition`; from `dates.ts` — `dayMonth`.

- **Produces**, newly exported from `desk-derivation.ts`:

```ts
/** R106's first-name helper, now also the custody word's. `fallback` is
 *  returned for an empty or absent name. */
export function firstName(name: string | null | undefined, fallback?: string): string;
```

- **Produces**, newly exported from `desk-roster-derivation.ts`:

```ts
/** D6 — whose hand the job is in, in words, written at derivation and never
 *  guessed at render. Exactly one of:
 *    'Your pen' · `With ${first}` · 'With the client' · 'With the maker' · 'At rest'
 *  A need whose rule stated no owner defaults to 'Your pen' (D6). No need at
 *  all is 'At rest'. */
export function custodyWord(need: NeedLine | null, row: DocumentStateRow): string;

/** D8 — the ledger's date column. The ISO date an in-motion state is anchored
 *  to, read off the row the chip was derived from. `null` for every motion
 *  kind whose state carries no date on `document_state`. */
export function motionAnchorDate(chip: MotionChip | null): string | null;
```

- **Produces**, four fields added to the existing `RosterLine` interface (nothing removed or renamed):

```ts
  /** D6 — the custody word. Always written. */
  custody: string;
  /** The need's own owner, for D3's ranking. Null where there is no need. */
  needOwner: 'designer' | 'client' | 'maker' | null;
  /** D8 — the ledger's value column, as `12 Aug`: the need's own date where
   *  the line has a need, else the in-motion state's anchor date. Null where
   *  neither states one, and the cell renders empty. */
  valueText?: string | null;
  /** The in-motion chip's own sentence, unconcatenated (MotionChip.text). */
  motionText?: string | null;
```

`custody` and `needOwner` are **required**, which is what breaks the six hand-built `RosterLine` literals in the two component test files; Step 10 fixes them in this task so the type-check closes here.

- [ ] **Step 1: Write the failing owner tests — driven through the real rules**

A table that only compares one constant to another proves nothing about the derivation. Drive the actual need rules and read `owner` off what they return.

In `apps/designer-portal/src/lib/document/__tests__/desk-derivation.test.ts`, first add the coverage guard, which is the one legitimate table assertion — it catches a *new* `NeedKind` added later with no owner:

```ts
import { NEED_ACTION_LABELS, type NeedKind } from '@/lib/document/desk-derivation';

/** D6 — every need kind states whose hand it is in. Ten carried nothing, and
 *  a card would have had to guess at render, which the ruling forbids. */
const OWNER_BY_KIND: Record<NeedKind, 'designer' | 'client' | 'maker'> = {
  overdue_decision: 'client',
  overdue_invoice: 'client',
  proposal_signed: 'designer',
  damage_claim: 'designer',
  proposal_declined: 'designer',
  proposal_expired: 'designer',
  lines_flagged: 'designer',
  new_lead: 'designer',
  ceremony_pending: 'designer',
  reconnect_due: 'designer',
  hesitating_proposal: 'client',
  awaiting_inspection: 'designer',
  schedule_conflict: 'designer',
  schedule_proposal: 'designer',
  task_due: 'designer',
  schedule_unconfigured: 'designer',
  po_unsent: 'designer',
  po_unacknowledged: 'maker',
  pulse_due: 'designer',
};

describe('D6 · the owner table covers every kind that exists', () => {
  it('names exactly the kinds the action-label table knows', () => {
    // A NeedKind added later without an owner fails here rather than shipping
    // a card that guesses. This is a coverage guard, NOT the owner assertion —
    // the assertions that matter drive the real rules, below.
    expect(Object.keys(OWNER_BY_KIND).sort()).toEqual(
      Object.keys(NEED_ACTION_LABELS).sort(),
    );
  });
});
```

Then amend the ten existing tests that already exercise each branch, so the assertion rides the real derivation. Each is an `it(...)` inside this file that already builds a row, calls the derivation, and asserts `need.kind`. Locate each by its `kind` assertion and add one line beside it. The ten, with the assertion to add:

| # | `kind` asserted in the existing test | Add beside it |
|---|---|---|
| 1 | `proposal_declined` | `expect(need.owner).toBe('designer');` |
| 2 | `proposal_expired` | `expect(need.owner).toBe('designer');` |
| 3 | `lines_flagged` | `expect(need.owner).toBe('designer');` |
| 4 | `damage_claim` | `expect(need.owner).toBe('designer');` |
| 5 | `awaiting_inspection` | `expect(need.owner).toBe('designer');` |
| 6 | `schedule_conflict` (collision) | `expect(need.owner).toBe('designer');` |
| 7 | `schedule_conflict` (contradiction) | `expect(need.owner).toBe('designer');` |
| 8 | `schedule_conflict` (proposal conflict) | `expect(need.owner).toBe('designer');` |
| 9 | `schedule_proposal` | `expect(need.owner).toBe('designer');` |
| 10 | `schedule_unconfigured` | `expect(need.owner).toBe('designer');` |

Find them with:

```bash
grep -n "proposal_declined\|proposal_expired\|lines_flagged\|damage_claim\|awaiting_inspection\|schedule_conflict\|schedule_proposal\|schedule_unconfigured" \
  /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards/apps/designer-portal/src/lib/document/__tests__/desk-derivation.test.ts
```

Three of the ten (`schedule_conflict` ×3) are asserted in `desk-schedule-conflict.test.ts` rather than `desk-derivation.test.ts` — check that file too and amend whichever holds each branch. If a branch turns out to have **no** existing test, write one in the style of its neighbours rather than skipping it; report which ones you had to add.

- [ ] **Step 2: Write the failing custody tests**

Append to `apps/designer-portal/src/lib/document/__tests__/desk-roster-derivation.test.ts`, reusing its existing `row()`, `need()`, `folder()`, `chip()`, `input()` builders and its `NOW = new Date('2026-08-25T12:00:00Z')`:

```ts
import { custodyWord } from '@/lib/document/desk-roster-derivation';

describe('D6 · custodyWord — whose hand, in words', () => {
  it('says Your pen for the studio’s own need', () => {
    expect(custodyWord(need({ owner: 'designer' }), row('a', 'project'))).toBe(
      'Your pen',
    );
  });

  it('defaults to Your pen when the rule stated no owner at all', () => {
    expect(custodyWord(need({ owner: undefined }), row('a', 'project'))).toBe(
      'Your pen',
    );
    expect(custodyWord(need({ owner: null }), row('a', 'project'))).toBe(
      'Your pen',
    );
  });

  it('names the client by first name where the row carries one', () => {
    const r = row('a', 'project', { client_name: 'Nora Ellison' });
    expect(custodyWord(need({ owner: 'client' }), r)).toBe('With Nora');
  });

  it('falls back to With the client where the name is a placeholder', () => {
    // `clientOf` refuses the seed's `Client User` as a family name, and so
    // does this — a role noun never stands in for a name we do not have.
    const r = row('a', 'project', { client_name: 'Client User' });
    expect(custodyWord(need({ owner: 'client' }), r)).toBe('With the client');
  });

  it('falls back to With the client where the row carries no name', () => {
    const r = row('a', 'project', { client_name: null });
    expect(custodyWord(need({ owner: 'client' }), r)).toBe('With the client');
  });

  it('says With the maker for a vendor-owned need', () => {
    expect(custodyWord(need({ owner: 'maker' }), row('a', 'project'))).toBe(
      'With the maker',
    );
  });

  it('says At rest where there is no need at all', () => {
    expect(custodyWord(null, row('a', 'project'))).toBe('At rest');
  });
});

describe('D6 · deriveDeskRoster writes custody onto every line', () => {
  it('carries the word and the owner on the line itself', () => {
    const claimed = row('claimed', 'project', { client_name: 'Nora Ellison' });
    const quiet = row('quiet', 'project');
    const roster = deriveDeskRoster(
      input({
        live: [claimed, quiet],
        folders: [folder(claimed, need({ owner: 'client' }))],
      }),
      NOW,
    );
    const lines = roster.groups[0].lines;

    expect(lines.find((l) => l.engagementId === 'claimed')!.custody).toBe(
      'With Nora',
    );
    expect(lines.find((l) => l.engagementId === 'claimed')!.needOwner).toBe(
      'client',
    );
    expect(lines.find((l) => l.engagementId === 'quiet')!.custody).toBe('At rest');
    expect(lines.find((l) => l.engagementId === 'quiet')!.needOwner).toBeNull();
  });
});
```

- [ ] **Step 3: Write the failing date-column tests, one per motion kind**

D8 rules the ledger's columns as *"mark ring · name with person · phase beneath · in-motion sentence · **its date** · Open"* — so the column is ruled in and must carry the in-motion state's own date.

**The reachable mapping, verified against `deriveMotion` and `DocumentStateRow` in the worktree.** Only three of the thirteen kinds `deriveMotion` actually returns have a date on the row; the rest carry none, and their cell renders empty:

| `MotionKind` | Date field on `DocumentStateRow` | Why that field |
|---|---|---|
| `with_client` | `proposal_last_opened_at ?? proposal_sent_at` | when they last opened it, else when it went |
| `sent_unopened` | `proposal_sent_at` | when it went, and it has not been opened since |
| `drafting` | `proposal_updated_at ?? updated_at` | the last touch on a draft that went cold |
| `paused`, `in_discovery`, `in_flight`, `drift`, `schedule_position`, `discovery_scheduled`, `slots_stale`, `intro_nudge`, `intro_sent` | — | `null` — the row carries no date for that state |

`conflict` is declared in the `MotionKind` union but `deriveMotion` never returns it; it maps to `null` for completeness and is not tested.

```ts
import { motionAnchorDate } from '@/lib/document/desk-roster-derivation';

describe('D8 · the ledger’s date column reads the in-motion state’s own date', () => {
  const dated = (kind: MotionKind, over: Partial<DocumentStateRow>) =>
    ({ row: row('m', 'project', over), kind, text: 'x' }) as unknown as MotionChip;

  it('reads the last open, then the send, for a proposal with the client', () => {
    expect(
      motionAnchorDate(
        dated('with_client', {
          proposal_sent_at: '2026-08-04T00:00:00Z',
          proposal_last_opened_at: '2026-08-12T00:00:00Z',
        }),
      ),
    ).toBe('2026-08-12T00:00:00Z');
    expect(
      motionAnchorDate(
        dated('with_client', { proposal_sent_at: '2026-08-04T00:00:00Z' }),
      ),
    ).toBe('2026-08-04T00:00:00Z');
  });

  it('reads the send date for a sent, unopened proposal', () => {
    expect(
      motionAnchorDate(
        dated('sent_unopened', { proposal_sent_at: '2026-08-04T00:00:00Z' }),
      ),
    ).toBe('2026-08-04T00:00:00Z');
  });

  it('reads the last touch for a cold draft, falling back to updated_at', () => {
    expect(
      motionAnchorDate(
        dated('drafting', { proposal_updated_at: '2026-08-06T00:00:00Z' }),
      ),
    ).toBe('2026-08-06T00:00:00Z');
    expect(
      motionAnchorDate(
        dated('drafting', {
          proposal_updated_at: null,
          updated_at: '2026-08-02T00:00:00Z',
        }),
      ),
    ).toBe('2026-08-02T00:00:00Z');
  });

  it.each([
    'paused',
    'in_discovery',
    'in_flight',
    'drift',
    'schedule_position',
    'discovery_scheduled',
    'slots_stale',
    'intro_nudge',
    'intro_sent',
  ] as const)('states no date for %s', (kind) => {
    expect(motionAnchorDate(dated(kind, {}))).toBeNull();
  });

  it('states no date with no chip at all', () => {
    expect(motionAnchorDate(null)).toBeNull();
  });
});

describe('D8 · deriveDeskRoster writes the value and the motion sentence', () => {
  it('prefers the need’s own date, in the surface’s one date style', () => {
    const dated = row('dated', 'project');
    const roster = deriveDeskRoster(
      input({ live: [dated], folders: [folder(dated, need({ dueOn: '2026-08-12' }))] }),
      NOW,
    );

    expect(roster.groups[0].lines[0].valueText).toBe('12 Aug');
  });

  it('falls to the in-motion date, and carries the chip’s own sentence', () => {
    const moving = row('moving', 'project', {
      proposal_sent_at: '2026-08-04T00:00:00Z',
    });
    const roster = deriveDeskRoster(
      input({
        live: [moving],
        chips: [
          {
            row: moving,
            kind: 'with_client',
            text: 'With client since 4 Aug',
          } as unknown as MotionChip,
        ],
      }),
      NOW,
    );

    expect(roster.groups[0].lines[0].valueText).toBe('4 Aug');
    expect(roster.groups[0].lines[0].motionText).toBe('With client since 4 Aug');
  });

  it('leaves the cell empty for a job that is neither needed nor moving', () => {
    const roster = deriveDeskRoster(input({ live: [row('still', 'project')] }), NOW);

    expect(roster.groups[0].lines[0].valueText).toBeNull();
    expect(roster.groups[0].lines[0].motionText).toBeNull();
  });
});
```

`MotionKind`, `MotionChip` and `DocumentStateRow` are already type-imported at the top of this test file; add `MotionKind` if it is not.

- [ ] **Step 4: Run the tests to verify they fail**

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal test -- --ci \
  src/lib/document/__tests__/desk-derivation.test.ts \
  src/lib/document/__tests__/desk-schedule-conflict.test.ts \
  src/lib/document/__tests__/desk-roster-derivation.test.ts
```

Expected: `custodyWord is not a function`, `motionAnchorDate is not a function`, and the ten `expect(need.owner).toBe('designer')` assertions receiving `undefined`.

- [ ] **Step 5: Fill the ten owners in `desk-derivation.ts`**

Add `owner: 'designer',` immediately after that branch's `urgent: false,` line, in each of the ten. Two shapes exist — a `seal({ ... })` call (branches 1–3) and a bare `return { ... };` (branches 4–10); the field goes in the same object either way. The ten, by rule function and unique anchor line:

| # | Rule function | `kind` | Unique anchor line in the branch |
|---|---|---|---|
| 1 | `needProposal` | `proposal_declined` | `stamp: { label: 'DECLINED', ...STAMP.terracotta },` |
| 2 | `needProposal` | `proposal_expired` | `stamp: { label: 'EXPIRED', ...STAMP.terracotta },` |
| 3 | `needProposal` | `lines_flagged` | `stamp: { label: 'FLAGGED', ...STAMP.clay },` |
| 4 | `needDamageClaim` | `damage_claim` | `stamp: { label: 'CLAIM OPEN', ...STAMP.terracotta, tone: 'damaged' },` |
| 5 | `needAwaitingInspection` | `awaiting_inspection` | `stamp: { label: 'DELIVERED', ...STAMP.sage },` |
| 6 | `needScheduleCollision` | `schedule_conflict` | `stamp: { label: conflict.collision.label, ...STAMP.terracotta },` |
| 7 | `needScheduleContradiction` | `schedule_conflict` | `text: schedule.contradictionText,` |
| 8 | `needScheduleProposalConflict` | `schedule_conflict` | `text: 'A recorded date contradicts an anchor already committed',` |
| 9 | `needScheduleProposal` | `schedule_proposal` | `stamp: { label: 'PROPOSED', ...STAMP.clay },` |
| 10 | `needScheduleUnconfigured` | `schedule_unconfigured` | `stamp: { label: 'BAND', ...STAMP.clay },` |

Example, branch 1:

```ts
    if (row.proposal_status === 'declined') {
      return seal({
        kind: 'proposal_declined',
        text: 'Proposal declined — follow up',
        actionLabel: NEED_ACTION_LABELS.proposal_declined,
        stamp: { label: 'DECLINED', ...STAMP.terracotta },
        urgent: false,
        owner: 'designer',
      });
    }
```

Verify the count:

```bash
grep -c "owner: 'designer'," \
  /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards/apps/designer-portal/src/lib/document/desk-derivation.ts
```

Expected: `17` — the 7 that already carried it (`proposal_signed`, `ceremony_pending`, `reconnect_due`, `new_lead`, `task_due`, `po_unsent`, `pulse_due`) plus the 10 added here.

- [ ] **Step 6: Export `firstName`**

Find:

```ts
function firstName(name: string | null | undefined, fallback = 'them'): string {
```

Replace with:

```ts
export function firstName(
  name: string | null | undefined,
  fallback = 'them',
): string {
```

Append to its existing comment block:

```
// D6: also the custody word's first name — "With Nora". The roster's own
// module reads it from here rather than growing a second copy that could
// drift from the parked card's copy.
```

- [ ] **Step 7: Add `custodyWord` and `motionAnchorDate` to `desk-roster-derivation.ts`**

Extend the import from `./desk-derivation` to add `firstName` (a value import) and `MotionKind`, `NeedLine` (type imports).

Immediately after `clientOf`, add:

```ts
/** D6's four words. 'At rest' is the fifth, and belongs to a job with no need
 *  at all rather than to an owner. */
const CUSTODY_YOUR_PEN = 'Your pen';
const CUSTODY_THE_CLIENT = 'With the client';
const CUSTODY_THE_MAKER = 'With the maker';
const CUSTODY_AT_REST = 'At rest';

/**
 * D6 — whose hand the job is in, said in one of four ways.
 *
 * The owner is READ off the need, never inferred at render: the rule that
 * derived the need already knew the answer, and a card that guesses is the
 * thing the ruling forbids. A need whose rule states no owner defaults to the
 * studio's own pen — the recommendation Kody took — rather than falling silent
 * or claiming a client we cannot name.
 *
 * The client's first name is printed only where `clientOf` will vouch for it:
 * the seed's placeholder `Client User` is refused here exactly as it is
 * refused on the line, because a role noun never stands in for a real name.
 */
export function custodyWord(
  need: NeedLine | null,
  row: DocumentStateRow,
): string {
  if (!need) return CUSTODY_AT_REST;
  if (need.owner === 'maker') return CUSTODY_THE_MAKER;
  if (need.owner === 'client') {
    const client = clientOf(row);
    return client ? `With ${firstName(client)}` : CUSTODY_THE_CLIENT;
  }
  return CUSTODY_YOUR_PEN;
}

/**
 * D8 — the date an in-motion state is anchored to, for the ledger's value
 * column.
 *
 * Only three of the kinds `deriveMotion` returns have a date on
 * `document_state`; the other nine state a position, not a moment, and their
 * cell stays empty rather than borrowing `updated_at`, which is a feed stamp
 * and not a fact about the job.
 */
export function motionAnchorDate(chip: MotionChip | null): string | null {
  if (!chip) return null;
  const row = chip.row;
  switch (chip.kind) {
    case 'with_client':
      return row.proposal_last_opened_at ?? row.proposal_sent_at ?? null;
    case 'sent_unopened':
      return row.proposal_sent_at ?? null;
    case 'drafting':
      return row.proposal_updated_at ?? row.updated_at ?? null;
    default:
      return null;
  }
}
```

- [ ] **Step 8: Add the four fields to `RosterLine` and write them in `deriveDeskRoster`**

(a) In the `RosterLine` interface, after `needText`, add the four declarations printed in this task's Interfaces block above, verbatim including their comments.

(b) In `deriveDeskRoster`'s `entries` map, add to the returned `line` object, after `needText`:

```ts
        custody: custodyWord(need, row),
        needOwner: need?.owner ?? null,
        // The need's own date first — a deadline outranks a provenance stamp.
        valueText: dayMonth(need?.dueOn ?? null) ?? dayMonth(motionAnchorDate(chip)),
        motionText: chip?.text ?? null,
```

`dayMonth` is already imported in this module and returns `string | null`.

> **Copy note, owed rather than fixed here.** `deriveMotion`'s `with_client` text already reads *"With client since 4 Aug"*, so a ledger row shows that date twice — once in prose, once in the column. Editing `deriveMotion`'s copy is out of scope: the folio renders the same chips. Record it in the ship report as an owed copy fix, do not fix it in this program.

- [ ] **Step 9: Update the six `RosterLine` literals in the two component test fixtures**

The two required fields break the hand-built fixtures. Find them:

```bash
grep -rn "overdueText:" \
  /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards/apps/designer-portal/src \
  | grep -v desk-roster-derivation.ts
```

Expected: 6 hits — three in `desk-roster-settle.test.tsx`, three in `desk-roster.test.tsx`. In each literal add, next to `mark`:

```tsx
            custody: 'Your pen',
            needOwner: 'designer',
```

except `desk-roster.test.tsx`'s `byrne` line, whose need is `hesitating_proposal` (client-owned) and whose `state` names *Erin Byrne* — use:

```tsx
            custody: 'With Erin',
            needOwner: 'client',
```

- [ ] **Step 10: Run the tests to verify they pass**

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal test -- --ci \
  src/lib/document/__tests__/desk-derivation.test.ts \
  src/lib/document/__tests__/desk-roster-derivation.test.ts \
  src/lib/document/__tests__/desk-action-labels.test.ts \
  src/lib/document/__tests__/desk-overdue-order.test.ts \
  src/lib/document/__tests__/desk-schedule-conflict.test.ts \
  src/lib/document/__tests__/desk-schedule.test.ts \
  src/lib/document/__tests__/desk-flagged-lines.test.ts \
  src/lib/document/__tests__/desk-task-due.test.ts \
  src/lib/document/__tests__/desk-conflicts.test.ts \
  src/lib/document/__tests__/desk-receivables.test.ts \
  src/components/document/desk-roster.test.tsx \
  src/components/document/desk-roster-settle.test.tsx
```

Expected: **all 12 suites green.** The seven beyond the two you edited are the ones that build `NeedLine`s and would catch an owner written onto the wrong branch. `desk-roster.test.tsx` and `desk-roster-settle.test.tsx` are green because Step 9 closed the fixtures and no component behaviour changed in this task.

- [ ] **Step 11: Gate — the type-check must be GREEN here**

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal type-check
```

Expected: exits 0, no output. No exported signature changed in this task, and Step 9 closed the only new required fields. **If it is red, do not proceed** — the redness belongs to Task 4, and inheriting it here hides whatever this task actually broke.

- [ ] **Step 12: Commit**

```bash
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards add \
  apps/designer-portal/src/lib/document/desk-derivation.ts \
  apps/designer-portal/src/lib/document/desk-roster-derivation.ts \
  apps/designer-portal/src/lib/document/__tests__/desk-derivation.test.ts \
  apps/designer-portal/src/lib/document/__tests__/desk-schedule-conflict.test.ts \
  apps/designer-portal/src/lib/document/__tests__/desk-roster-derivation.test.ts \
  apps/designer-portal/src/components/document/desk-roster.test.tsx \
  apps/designer-portal/src/components/document/desk-roster-settle.test.tsx
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards commit -m "feat(desk): every need states its owner, and every line its custody word" -- \
  apps/designer-portal/src/lib/document/desk-derivation.ts \
  apps/designer-portal/src/lib/document/desk-roster-derivation.ts \
  apps/designer-portal/src/lib/document/__tests__/desk-derivation.test.ts \
  apps/designer-portal/src/lib/document/__tests__/desk-schedule-conflict.test.ts \
  apps/designer-portal/src/lib/document/__tests__/desk-roster-derivation.test.ts \
  apps/designer-portal/src/components/document/desk-roster.test.tsx \
  apps/designer-portal/src/components/document/desk-roster-settle.test.tsx
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards show --stat HEAD
```

Expected: 7 files (6 if no `schedule_conflict` test needed amending in `desk-schedule-conflict.test.ts` — drop it from both lists in that case).

---

## Task 4 (was 3b) (D5, D3, D7, D8): The claims split, and the day's line that quotes it

This is the task that changes an exported signature — `deriveDeskDayLine`'s first parameter and `DeskDayLine.more`'s shape — so it **ends with a red type-check in exactly one file**, `desk-roster.tsx`, which Task 7 closes. That is expected and is stated in the gate.

**Files:**
- Modify: `apps/designer-portal/src/lib/document/desk-roster-derivation.ts`
- Modify: `apps/designer-portal/src/lib/document/__tests__/desk-roster-derivation.test.ts` (including a **wholesale replacement of lines 469–758**)

**Interfaces:**

- **Consumes** from Task 3: `custodyWord`, `motionAnchorDate`, and the four new `RosterLine` fields (`custody`, `needOwner`, `valueText`, `motionText`). From the pre-existing module: `DeskRoster`, `RosterGroup`, `RosterLine`, `RosterPerson`, `RosterPersonGroup`, `AnsweredClientNote`, `ROSTER_STAGE_ORDER`, `STAGE_LABEL` (module-private), `anchorTime` (module-private), `rosterLineNeedsAHand`, `filterRosterToNeeds`, `groupRosterByPerson`, `overdueElapsedPhrase`.

- **Produces:**

```ts
/** The id the day's line's `more` link lands on — the claims grid's element. */
export const CLAIMS_ANCHOR_ID = 'desk-claims';

/** D3's rank bands. 0 = the studio's own pen and overdue; 1 = the studio's own
 *  pen; 2 = with the client; 3 = with the maker. */
export type ClaimBand = 0 | 1 | 2 | 3;

export interface ClaimCard {
  /** The roster line this card renders. A card introduces no job the roster
   *  does not list. */
  line: RosterLine;
  stage: SectionKey;
  /** Sentence case; the plate's CSS uppercases. */
  stageLabel: string;
  /** `line.custody`, lifted so the card's second register reads one field. */
  custody: string;
  band: ClaimBand;
}

export interface ClaimPersonGroup {
  key: string;
  label: string;
  count: number;
  cards: ClaimCard[];
}

export interface DeskClaimsInput {
  roster: DeskRoster;
  answeredNotes: readonly AnsweredClientNote[];
  now: Date;
}

export interface DeskClaims {
  /** D5 — every line with `mark !== null`, in D3's rank order. */
  cards: ClaimCard[];
  /** D8 — the rest, grouped under the seven stage plates, stage-first. */
  ledger: RosterGroup[];
  /** `Every job · 16 live · 2 overdue` — the roster's own heading, unchanged. */
  heading: string;
  /** `At rest · 11 jobs` / `At rest · 1 job`. Empty string when the ledger is. */
  restHeading: string;
  /** D7 — up to three card lines plus the answered note. Null when neither. */
  dayLine: DeskDayLine | null;
}

export function deriveDeskClaims(input: DeskClaimsInput): DeskClaims;

export function groupClaimsByPerson(
  cards: readonly ClaimCard[],
  people: readonly RosterPerson[],
): ClaimPersonGroup[];
```

- **Produces**, two **changed** shapes on existing exports:

```ts
/** `key` is `card-${engagementId}` or `'answered'` — no longer the closed
 *  'overdue' | 'lead' | 'answered' union. */
export interface DayLine {
  key: string;
  engagementId: string;
  parts: DayLinePart[];
}

/** `more` points at the claims grid, which has no stage — `stageKey` is gone. */
export interface DeskDayLine {
  lines: DayLine[];
  more: { count: number; anchorId: string } | null;
}

/** D7 — the line quotes the grid it sits above. FIRST PARAMETER CHANGED: it
 *  took a `DeskRoster`, it now takes the ranked cards and the whole roster. */
export function deriveDeskDayLine(
  cards: readonly ClaimCard[],
  roster: DeskRoster,
  answeredNotes: readonly AnsweredClientNote[],
  now: Date,
): DeskDayLine | null;
```

`DayLinePart` is unchanged. `MAX_DAY_LINES` stays exported at `3` and now caps the **card** lines; the answered note is a fourth line on top of it (D7). `ANSWERED_NOTE_WINDOW_MS` is unchanged.

- [ ] **Step 1: Replace the existing day's-line suite wholesale — lines 469–758**

`desk-roster-derivation.test.ts` currently holds `describe('deriveDeskDayLine — the day's line (IA-05)')` spanning **lines 469 to 758** (the next `describe` opens at 759). Every test in it calls the old three-argument signature and several assert `more.stageKey`. It cannot be patched incrementally — the selection rule it pins is the rule D7 replaces.

**Delete lines 469–758 entirely** and put this in their place:

```ts
describe('deriveDeskDayLine — the day’s line quotes the grid (D7)', () => {
  function claimsOf(over: Partial<DeskRosterInput> = {}, notes: AnsweredClientNote[] = []) {
    return deriveDeskClaims({
      roster: deriveDeskRoster(input(over), NOW),
      answeredNotes: notes,
      now: NOW,
    });
  }

  it('names the first three cards, in the grid’s own rank order', () => {
    const late = row('late', 'project', { title: 'Vandersteen residence' });
    const mine = row('mine', 'project', { title: 'Cedar Lane study' });
    const theirs = row('theirs', 'proposal', { title: 'Halvorsen loft' });
    const fourth = row('fourth', 'care', { title: 'Osterberg cottage' });
    const result = claimsOf({
      live: [late, mine, theirs, fourth],
      folders: [
        folder(late, need({ owner: 'designer', dueOn: '2026-08-01' })),
        folder(mine, need({ owner: 'designer', text: 'Two rooms await your mark-up' })),
        folder(theirs, need({ owner: 'client', text: 'Opened, not signed' })),
        folder(fourth, need({ owner: 'maker', text: 'The maker has not acknowledged' })),
      ],
    });

    expect(result.dayLine!.lines.map((l) => l.key)).toEqual([
      'card-late',
      'card-mine',
      'card-theirs',
    ]);
    expect(result.dayLine!.lines[0].parts[0]).toEqual({
      kind: 'job',
      text: 'Vandersteen residence',
      engagementId: 'late',
    });
  });

  it('prints the overdue clause in the red letter’s own part kind', () => {
    const late = row('late', 'project');
    const result = claimsOf({
      live: [late],
      folders: [folder(late, need({ owner: 'designer', dueOn: '2026-08-01' }))],
    });
    const clause = result.dayLine!.lines[0].parts.find((p) => p.kind === 'overdue');

    expect(clause).toBeDefined();
    expect(clause!.text).toContain('overdue');
  });

  it('says the card’s own reason when nothing is overdue', () => {
    const mine = row('mine', 'project');
    const result = claimsOf({
      live: [mine],
      folders: [folder(mine, need({ owner: 'designer', text: 'Two rooms await your mark-up' }))],
    });

    expect(result.dayLine!.lines[0].parts[1]).toEqual({
      kind: 'text',
      text: ' — Two rooms await your mark-up',
    });
  });

  it('counts the cards it could not name, and points at the grid', () => {
    const live = ['a', 'b', 'c', 'd', 'e'].map((id) => row(id, 'project'));
    const result = claimsOf({
      live,
      folders: live.map((r) => folder(r, need({ owner: 'designer' }))),
    });

    expect(result.dayLine!.lines).toHaveLength(3);
    expect(result.dayLine!.more).toEqual({ count: 2, anchorId: CLAIMS_ANCHOR_ID });
  });

  it('has no more-link when every card is named', () => {
    const live = ['a', 'b'].map((id) => row(id, 'project'));
    const result = claimsOf({
      live,
      folders: live.map((r) => folder(r, need({ owner: 'designer' }))),
    });

    expect(result.dayLine!.more).toBeNull();
  });

  it('says nothing at all when nothing claims her hand', () => {
    // A "nothing needs you" banner over sixteen live jobs is a second queue.
    expect(claimsOf({ live: [row('a', 'project')] }).dayLine).toBeNull();
  });
});

describe('deriveDeskDayLine — the answered client note (D7’s fourth line)', () => {
  function claimsOf(over: Partial<DeskRosterInput> = {}, notes: AnsweredClientNote[] = []) {
    return deriveDeskClaims({
      roster: deriveDeskRoster(input(over), NOW),
      answeredNotes: notes,
      now: NOW,
    });
  }

  it('speaks for a job that has a CARD', () => {
    const claimed = row('claimed', 'project', {
      title: 'Byrne remodel',
      client_name: 'Erin Byrne',
      project_id: 'p-byrne',
    });
    const result = claimsOf(
      { live: [claimed], folders: [folder(claimed, need({ owner: 'designer' }))] },
      [{ projectId: 'p-byrne', answeredAt: '2026-08-25T06:00:00Z' }],
    );

    expect(result.dayLine!.lines.map((l) => l.key)).toEqual([
      'card-claimed',
      'answered',
    ]);
    expect(result.dayLine!.lines[1].parts).toEqual([
      { kind: 'text', text: 'Erin Byrne replied last night — ' },
      { kind: 'job', text: 'Byrne remodel', engagementId: 'claimed' },
    ]);
  });

  it('speaks for a QUIET job that is only a ledger row', () => {
    // The client answering is news whether or not the job claims her hand;
    // searching only the cards would have silently dropped this line.
    const quiet = row('quiet', 'care', {
      title: 'Osterberg cottage',
      client_name: 'Nora Ellison',
      project_id: 'p-nora',
    });
    const result = claimsOf({ live: [quiet] }, [
      { projectId: 'p-nora', answeredAt: '2026-08-25T06:00:00Z' },
    ]);

    expect(result.cards).toEqual([]);
    expect(result.dayLine!.lines.map((l) => l.key)).toEqual(['answered']);
    expect(result.dayLine!.lines[0].parts).toEqual([
      { kind: 'text', text: 'Nora Ellison replied last night — ' },
      { kind: 'job', text: 'Osterberg cottage', engagementId: 'quiet' },
    ]);
  });

  it('never quotes one job twice — a named card takes the note’s slot', () => {
    const claimed = row('claimed', 'project', {
      title: 'Byrne remodel',
      client_name: 'Erin Byrne',
      project_id: 'p-byrne',
    });
    const other = row('other', 'care', {
      title: 'Osterberg cottage',
      client_name: 'Nora Ellison',
      project_id: 'p-nora',
    });
    const result = claimsOf(
      {
        live: [claimed, other],
        folders: [folder(claimed, need({ owner: 'designer' }))],
      },
      [
        { projectId: 'p-byrne', answeredAt: '2026-08-25T07:00:00Z' },
        { projectId: 'p-nora', answeredAt: '2026-08-25T06:00:00Z' },
      ],
    );

    // p-byrne is newest, but its job is already quoted as card-claimed, so the
    // note falls to the next unquoted job rather than naming Byrne twice.
    expect(result.dayLine!.lines.map((l) => l.engagementId)).toEqual([
      'claimed',
      'other',
    ]);
  });

  it('drops a note older than the window', () => {
    const quiet = row('quiet', 'care', {
      client_name: 'Nora Ellison',
      project_id: 'p-nora',
    });
    const result = claimsOf({ live: [quiet] }, [
      { projectId: 'p-nora', answeredAt: '2026-08-20T06:00:00Z' },
    ]);

    expect(result.dayLine).toBeNull();
  });

  it('cannot say the line without a client name', () => {
    // The roster refuses a role noun standing in for a name, and so does this.
    const quiet = row('quiet', 'care', {
      client_name: 'Client User',
      project_id: 'p-nora',
    });
    const result = claimsOf({ live: [quiet] }, [
      { projectId: 'p-nora', answeredAt: '2026-08-25T06:00:00Z' },
    ]);

    expect(result.dayLine).toBeNull();
  });
});
```

- [ ] **Step 2: Write the failing claims-split and ranking tests**

Append to the same file:

```ts
describe('D5 · a claim takes a card, a quiet job takes a line', () => {
  function claimsOf(over: Partial<DeskRosterInput> = {}) {
    return deriveDeskClaims({
      roster: deriveDeskRoster(input(over), NOW),
      answeredNotes: [],
      now: NOW,
    });
  }

  it('cards every marked line and leaves every unmarked one in the ledger', () => {
    const claimed = row('claimed', 'project');
    const quietA = row('quiet-a', 'project');
    const quietB = row('quiet-b', 'care');
    const result = claimsOf({
      live: [claimed, quietA, quietB],
      folders: [folder(claimed)],
    });

    expect(result.cards.map((c) => c.line.engagementId)).toEqual(['claimed']);
    expect(result.ledger.map((g) => g.key)).toEqual(['project', 'care']);
    expect(result.ledger[0].lines.map((l) => l.engagementId)).toEqual(['quiet-a']);
    expect(result.ledger[0].count).toBe(1);
  });

  it('drops a stage group the split emptied', () => {
    const claimed = row('claimed', 'project');
    expect(claimsOf({ live: [claimed], folders: [folder(claimed)] }).ledger).toEqual([]);
  });

  it('agrees with filterRosterToNeeds, which is the same predicate', () => {
    const claimed = row('claimed', 'project');
    const quiet = row('quiet', 'project');
    const roster = deriveDeskRoster(
      input({ live: [claimed, quiet], folders: [folder(claimed)] }),
      NOW,
    );
    const result = deriveDeskClaims({ roster, answeredNotes: [], now: NOW });

    expect(result.cards.map((c) => c.line.engagementId)).toEqual(
      filterRosterToNeeds(roster.groups).flatMap((g) =>
        g.lines.map((l) => l.engagementId),
      ),
    );
  });

  it('keeps the roster’s own heading, and counts the ledger head', () => {
    const claimed = row('claimed', 'project');
    const quiet = row('quiet', 'project');
    const result = claimsOf({ live: [claimed, quiet], folders: [folder(claimed)] });

    expect(result.heading).toBe('Every job · 2 live · 0 overdue');
    expect(result.restHeading).toBe('At rest · 1 job');
  });

  it('pluralises the ledger head, and says nothing over an empty ledger', () => {
    const a = row('a', 'project');
    const b = row('b', 'project');
    expect(claimsOf({ live: [a, b] }).restHeading).toBe('At rest · 2 jobs');
    expect(claimsOf({ live: [] }).restHeading).toBe('');
  });

  it('keeps the ledger under the paper’s own stage order (D8)', () => {
    const live = [...ROSTER_STAGE_ORDER].reverse().map((s) => row(s, s));
    const result = claimsOf({ live });

    expect(result.ledger.map((g) => g.key)).toEqual([...ROSTER_STAGE_ORDER]);
    expect(result.cards).toEqual([]);
  });
});

describe('D3 · the cards rank by band, then oldest, then name', () => {
  function claimsOf(over: Partial<DeskRosterInput> = {}) {
    return deriveDeskClaims({
      roster: deriveDeskRoster(input(over), NOW),
      answeredNotes: [],
      now: NOW,
    });
  }

  it('bands designer+overdue, designer, client, maker — in that order', () => {
    const late = row('z-late', 'project', { title: 'Z overdue' });
    const mine = row('m-mine', 'project', { title: 'M owned' });
    const theirs = row('client-held', 'project', { title: 'Client held' });
    const maker = row('maker-held', 'project', { title: 'Maker held' });
    const result = claimsOf({
      live: [maker, theirs, mine, late],
      folders: [
        folder(maker, need({ owner: 'maker' })),
        folder(theirs, need({ owner: 'client' })),
        folder(mine, need({ owner: 'designer' })),
        folder(late, need({ owner: 'designer', dueOn: '2026-08-01' })),
      ],
    });

    expect(result.cards.map((c) => c.band)).toEqual([0, 1, 2, 3]);
    expect(result.cards.map((c) => c.line.engagementId)).toEqual([
      'z-late',
      'm-mine',
      'client-held',
      'maker-held',
    ]);
  });

  it('puts the oldest need date first inside a band', () => {
    const soon = row('m-soon', 'project', { title: 'M soon' });
    const older = row('a-older', 'project', { title: 'A older' });
    const result = claimsOf({
      live: [soon, older],
      folders: [
        folder(soon, need({ owner: 'designer', dueOn: '2026-09-20' })),
        folder(older, need({ owner: 'designer', dueOn: '2026-09-01' })),
      ],
    });

    expect(result.cards.map((c) => c.line.engagementId)).toEqual([
      'a-older',
      'm-soon',
    ]);
  });

  it('breaks a tie on the name, never on the id', () => {
    // A UUID tiebreak is stable but arbitrary; a name is legible.
    const zed = row('aaa', 'project', { title: 'Zeta house' });
    const ash = row('zzz', 'project', { title: 'Ash house' });
    const result = claimsOf({
      live: [zed, ash],
      folders: [
        folder(zed, need({ owner: 'designer' })),
        folder(ash, need({ owner: 'designer' })),
      ],
    });

    expect(result.cards.map((c) => c.line.name)).toEqual([
      'Ash house',
      'Zeta house',
    ]);
  });

  it('orders two UNDATED same-band cards by name', () => {
    // Both dueOn are absent, so both anchor times are +Infinity and the date
    // comparison yields NaN, not 0. NaN is falsy, so `||` falls through to the
    // name comparison — the behaviour this test pins, because a subtraction
    // that returns NaN silently is exactly the kind of thing a refactor
    // "simplifies" into a broken sort.
    const zed = row('aaa', 'project', { title: 'Zeta house' });
    const ash = row('zzz', 'project', { title: 'Ash house' });
    const result = claimsOf({
      live: [zed, ash],
      folders: [
        folder(zed, need({ owner: 'designer', dueOn: null })),
        folder(ash, need({ owner: 'designer', dueOn: null })),
      ],
    });

    expect(result.cards.map((c) => c.line.name)).toEqual([
      'Ash house',
      'Zeta house',
    ]);
  });

  it('sorts a dated card ahead of an undated one in the same band', () => {
    const dated = row('dated', 'project', { title: 'Zeta house' });
    const undated = row('undated', 'project', { title: 'Ash house' });
    const result = claimsOf({
      live: [dated, undated],
      folders: [
        folder(dated, need({ owner: 'designer', dueOn: '2026-09-01' })),
        folder(undated, need({ owner: 'designer', dueOn: null })),
      ],
    });

    expect(result.cards.map((c) => c.line.engagementId)).toEqual([
      'dated',
      'undated',
    ]);
  });

  it('carries the stage and its sentence-case label on the card', () => {
    const mine = row('mine', 'project');
    const result = claimsOf({ live: [mine], folders: [folder(mine)] });

    expect(result.cards[0].stage).toBe('project');
    expect(result.cards[0].stageLabel).toBe('Project');
    expect(result.cards[0].custody).toBe('Your pen');
  });
});

describe('IA-12 · By person regroups the card half too', () => {
  const PEOPLE = deriveRosterPeople([
    {
      user_id: 'user-leah',
      role: 'owner',
      status: 'active',
      profiles: { full_name: 'Leah Hartwell', display_name: null },
    },
    {
      user_id: 'user-anneke',
      role: 'member',
      status: 'active',
      profiles: { full_name: 'Anneke Sund', display_name: null },
    },
  ]);

  function cardsOf(over: Partial<DeskRosterInput> = {}) {
    return deriveDeskClaims({
      roster: deriveDeskRoster(input(over), NOW),
      answeredNotes: [],
      now: NOW,
    }).cards;
  }

  it('groups the cards by designerId, principal first', () => {
    const mine = row('mine', 'project', { designer_id: 'user-leah' });
    const hers = row('hers', 'project', { designer_id: 'user-anneke' });
    const grouped = groupClaimsByPerson(
      cardsOf({ live: [mine, hers], folders: [folder(mine), folder(hers)] }),
      PEOPLE,
    );

    expect(grouped.map((g) => [g.label, g.count])).toEqual([
      ['Leah Hartwell', 1],
      ['Anneke Sund', 1],
    ]);
    expect(grouped[0].cards[0].line.engagementId).toBe('mine');
  });

  it('groups an unassigned card under the principal, never dropping it', () => {
    const orphan = row('orphan', 'project', { designer_id: null });
    const grouped = groupClaimsByPerson(
      cardsOf({ live: [orphan], folders: [folder(orphan)] }),
      PEOPLE,
    );

    expect(grouped).toHaveLength(1);
    expect(grouped[0].count).toBe(1);
  });

  it('returns nothing to group when the studio has no named people', () => {
    const mine = row('mine', 'project');
    expect(groupClaimsByPerson(cardsOf({ live: [mine], folders: [folder(mine)] }), [])).toEqual([]);
  });
});
```

Add `CLAIMS_ANCHOR_ID`, `deriveDeskClaims`, `groupClaimsByPerson` and the `ClaimCard` type to this file's import from `@/lib/document/desk-roster-derivation`.

- [ ] **Step 3: Run to verify they fail**

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal test -- --ci \
  src/lib/document/__tests__/desk-roster-derivation.test.ts
```

Expected: `deriveDeskClaims is not a function`, `groupClaimsByPerson is not a function`, `CLAIMS_ANCHOR_ID` undefined.

- [ ] **Step 4: Rewrite the day's line**

In `desk-roster-derivation.ts`, replace the `DayLine` / `DeskDayLine` interfaces and the whole `deriveDeskDayLine` function, and delete the now-unused `byDueThenId` and `LEAD_SENTENCE` helpers. Keep `FlatLine` and `flatten` — the answered-note search needs them.

```ts
/** The id the `more` link lands on — the claims grid's own element. The grid
 *  has no stage, so the old `#roster-stage-{key}` target is gone with the
 *  stage-first grid it pointed into. */
export const CLAIMS_ANCHOR_ID = 'desk-claims';

export interface DayLine {
  /** `card-${engagementId}` for a quoted card, `answered` for the note. */
  key: string;
  /** The row this line is a view of. */
  engagementId: string;
  parts: DayLinePart[];
}

export interface DeskDayLine {
  lines: DayLine[];
  /** `and N more below`, pointing at the claims grid. */
  more: { count: number; anchorId: string } | null;
}

/** D7 — the line quotes the top THREE cards. The answered note is a fourth
 *  line on top of that, not one of the three. */
export const MAX_DAY_LINES = 3;

/**
 * D7 — the day's line, now a view of the grid it sits above.
 *
 * Before this it selected by its own rule (oldest overdue → newest lead →
 * client-answered) while the roster ordered by another. That was tolerable
 * under stage plates, where the line was a shortcut into a list; in a grid,
 * where POSITION is the message, a line contradicting the first card means
 * neither is trusted.
 *
 * The card lines quote the grid. The answered note does NOT: it searches the
 * whole roster, because a client answering is news whether or not the job
 * claims her hand, and a quiet job is exactly the one she would otherwise not
 * look at today. The `taken` set spans both, so no job is ever named twice.
 */
export function deriveDeskDayLine(
  cards: readonly ClaimCard[],
  roster: DeskRoster,
  answeredNotes: readonly AnsweredClientNote[],
  now: Date,
): DeskDayLine | null {
  const lines: DayLine[] = [];
  const taken = new Set<string>();

  for (const card of cards.slice(0, MAX_DAY_LINES)) {
    const { line } = card;
    taken.add(line.engagementId);
    const elapsed = overdueElapsedPhrase(line.overdue);
    lines.push({
      key: `card-${line.engagementId}`,
      engagementId: line.engagementId,
      parts: [
        { kind: 'job', text: line.name, engagementId: line.engagementId },
        elapsed
          ? { kind: 'overdue', text: ` — overdue ${elapsed}` }
          : {
              // The card's own reason, not a second sentence about it: a line
              // that paraphrases the card is a second queue in miniature.
              kind: 'text',
              text: ` — ${line.needText ?? line.act.label.toLowerCase()}`,
            },
      ],
    });
  }

  const floor = now.getTime() - ANSWERED_NOTE_WINDOW_MS;
  const answered = answeredNotes
    .map((note) => ({ note, at: Date.parse(note.answeredAt) }))
    .filter(
      (entry) =>
        Number.isFinite(entry.at) &&
        entry.at >= floor &&
        entry.at <= now.getTime(),
    )
    .sort((a, b) => b.at - a.at);
  const flat = flatten(roster);
  for (const { note } of answered) {
    const match = flat.find(
      (entry) =>
        entry.line.projectId === note.projectId &&
        !!entry.line.client &&
        !taken.has(entry.line.engagementId),
    );
    if (!match) continue;
    taken.add(match.line.engagementId);
    lines.push({
      key: 'answered',
      engagementId: match.line.engagementId,
      parts: [
        { kind: 'text', text: `${match.line.client} replied last night — ` },
        {
          kind: 'job',
          text: match.line.name,
          engagementId: match.line.engagementId,
        },
      ],
    });
    break;
  }

  // Nothing claims her hand: the band does not render. A "nothing needs you"
  // banner over sixteen live jobs is itself a second queue.
  if (lines.length === 0) return null;

  const quoted = lines.filter((line) => line.key !== 'answered').length;
  const remaining = cards.length - quoted;
  return {
    lines,
    more: remaining > 0 ? { count: remaining, anchorId: CLAIMS_ANCHOR_ID } : null,
  };
}
```

- [ ] **Step 5: Add the claims derivation**

Append after the day's-line section:

```ts
/* ── The claims split (D5, D3, D8) ──────────────────────────────────────────
 *
 * R143: one line per job in the at-rest ledger; a job with a claim on the
 * studio's hand takes a Claim card. The predicate is the mark the roster
 * already draws — `mark !== null`, every job carrying a need — so the split
 * reads the same fact the margin does rather than deriving a second one.
 * ─────────────────────────────────────────────────────────────────────────── */

export type ClaimBand = 0 | 1 | 2 | 3;

export interface ClaimCard {
  line: RosterLine;
  stage: SectionKey;
  stageLabel: string;
  custody: string;
  band: ClaimBand;
}

export interface ClaimPersonGroup {
  key: string;
  label: string;
  count: number;
  cards: ClaimCard[];
}

export interface DeskClaimsInput {
  roster: DeskRoster;
  answeredNotes: readonly AnsweredClientNote[];
  now: Date;
}

export interface DeskClaims {
  cards: ClaimCard[];
  ledger: RosterGroup[];
  heading: string;
  restHeading: string;
  dayLine: DeskDayLine | null;
}

function claimBand(line: RosterLine): ClaimBand {
  if (line.needOwner === 'maker') return 3;
  if (line.needOwner === 'client') return 2;
  // 'designer', and the D6 default for a need whose rule stated no owner.
  return line.overdue.isOverdue ? 0 : 1;
}

function restHeadingFor(count: number): string {
  if (count === 0) return '';
  return `At rest · ${count} ${count === 1 ? 'job' : 'jobs'}`;
}

/**
 * D5 · D3 · D8 — the Desk in two halves.
 *
 * Takes the roster `deriveDeskRoster` already built rather than rebuilding it,
 * so the head's counts, the stage grouping and every line's own derivation are
 * one computation with one source of truth. The card half is RE-ORDERED (D3:
 * rank, with the reason printed on the card); the ledger half keeps the
 * stage-first order it shipped with, because a ledger has headings to skip and
 * a grid does not.
 */
export function deriveDeskClaims(input: DeskClaimsInput): DeskClaims {
  const { roster, answeredNotes, now } = input;

  const cards: ClaimCard[] = [];
  const ledger: RosterGroup[] = [];

  for (const group of roster.groups) {
    const rest: RosterLine[] = [];
    for (const line of group.lines) {
      if (rosterLineNeedsAHand(line)) {
        cards.push({
          line,
          stage: line.stage,
          stageLabel: STAGE_LABEL[line.stage],
          custody: line.custody,
          band: claimBand(line),
        });
      } else {
        rest.push(line);
      }
    }
    if (rest.length > 0) {
      ledger.push({ ...group, count: rest.length, lines: rest });
    }
  }

  // Band, then oldest need date, then name. Two undated cards give
  // +Infinity − +Infinity = NaN, which is falsy, so `||` falls through to the
  // name — deliberate, and pinned by test. An undated card sorts BEHIND a
  // dated one, because +Infinity − finite is +Infinity.
  cards.sort(
    (a, b) =>
      a.band - b.band ||
      anchorTime(a.line.dueOn) - anchorTime(b.line.dueOn) ||
      a.line.name.localeCompare(b.line.name),
  );

  const restCount = ledger.reduce((total, group) => total + group.count, 0);

  return {
    cards,
    ledger,
    heading: roster.heading,
    restHeading: restHeadingFor(restCount),
    dayLine: deriveDeskDayLine(cards, roster, answeredNotes, now),
  };
}

/**
 * Regroups the CARD half by the person who carries the job, on exactly the
 * rule `groupRosterByPerson` uses for the ledger half: a card with no
 * `designerId`, or one naming nobody on the list, groups under the principal
 * rather than vanishing.
 */
export function groupClaimsByPerson(
  cards: readonly ClaimCard[],
  people: readonly RosterPerson[],
): ClaimPersonGroup[] {
  if (people.length === 0) return [];

  const principal = people.find((person) => person.isPrincipal) ?? people[0];
  const known = new Set(people.map((person) => person.id));
  const cardsByPerson = new Map<string, ClaimCard[]>(
    people.map((person) => [person.id, []]),
  );

  for (const card of cards) {
    const id =
      card.line.designerId && known.has(card.line.designerId)
        ? card.line.designerId
        : principal.id;
    cardsByPerson.get(id)!.push(card);
  }

  return people
    .map((person) => ({
      key: `person-${person.id}`,
      label: person.name,
      count: cardsByPerson.get(person.id)!.length,
      cards: cardsByPerson.get(person.id)!,
    }))
    .filter((group) => group.count > 0);
}
```

- [ ] **Step 6: Run the derivation suite to verify it passes**

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal test -- --ci \
  src/lib/document/__tests__/desk-roster-derivation.test.ts
```

Expected: green, including the two replaced describes.

- [ ] **Step 7: Gate — the type-check is RED here, in exactly one file**

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal type-check
```

Expected: errors **only** in `apps/designer-portal/src/components/document/desk-roster.tsx`, from `deriveDeskDayLine`'s changed parameter list and `DeskDayLine.more`'s changed shape. Task 7 closes them.

Because Task 3 already fixed the six `RosterLine` fixtures, **no test file should error here.** If one does, a signature changed that this task did not intend to change — find it before moving on.

`desk-roster.test.tsx` and `desk-roster-settle.test.tsx` will now also **fail at runtime** (not just type-check) if run, because `DeskRoster` still calls the old day's-line signature. That is expected between Task 4 and Task 7; do not "fix" them here.

- [ ] **Step 8: Commit**

```bash
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards add \
  apps/designer-portal/src/lib/document/desk-roster-derivation.ts \
  apps/designer-portal/src/lib/document/__tests__/desk-roster-derivation.test.ts
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards commit -m "feat(desk): the claims split, and a day's line that quotes the grid" -- \
  apps/designer-portal/src/lib/document/desk-roster-derivation.ts \
  apps/designer-portal/src/lib/document/__tests__/desk-roster-derivation.test.ts
```

Expected: 2 files.

---
## Task 5 (was 4a) (D4, D10): The Claim card, and the R143 stylesheet block

**Naming.** The components are `DeskClaimCard`, `DeskLedgerRow` and `DeskClaimsGrid` — not `ClaimCard`, `DeskLedgerRow`, `DeskClaims` — because `ClaimCard` and `DeskClaims` are the names of the *types* Task 4 exports, and a same-name type and value across two modules is drift a plan should not create.

**Files:**
- Modify: `apps/designer-portal/src/app/globals.css`
- Create: `apps/designer-portal/src/components/document/desk-claim-card.tsx`
- Create: `apps/designer-portal/src/components/document/desk-claim-card.test.tsx`

**Interfaces:**

- **Consumes** from Task 4: the `ClaimCard` type. From the existing tree: `DocumentAction`, `openLedger`, `RowWash`, `useRowWash`, `RowWashTone`. From Task 2: the `--color-card-edge` token.

- **Produces**, from `desk-claim-card.tsx`:

```tsx
/** D9's ink pigments, shared with the ledger row. */
export const MARK_COLOR: { readonly urgent: string; readonly quiet: string };

/** The six stage plate fills, and the nine wash tones. Exported here so the
 *  grid and the ledger read one table rather than three copies. */
export const STAGE_TAB: Record<SectionKey, string>;
export const STAGE_TONE: Record<SectionKey, RowWashTone>;

/** `data-roster-line` was the row's identity; an `id` is what a link lands on,
 *  and the day's line is nothing but links into the Desk. MOVED here from
 *  desk-roster.tsx, which now re-exports it for its existing importers. */
export function rosterLineAnchorId(engagementId: string): string;

export function DeskClaimCard(props: {
  card: ClaimCard;
  tone: RowWashTone;
  /** The settle stagger index; ignored when `settle` is false. */
  index?: number;
  settle: boolean;
  tourAnchor?: string;
}): JSX.Element;
```

- **Produces**, the DOM contract every later task's tests read: `[data-claim-card="<engagementId>"]` on the `<li>`; `[data-register]` on each of the six registers in order (`stage`, `custody`, `name`, `person`, `sentence`, `act`); `[data-roster-mark]`, `[data-roster-name]`, `[data-roster-overdue]`; the classes `desk-claim-card`, `desk-claim-upper`, `desk-claim-sentence`, `desk-claim-band`.

- [ ] **Step 1: Write the failing card test**

Create `apps/designer-portal/src/components/document/desk-claim-card.test.tsx`:

```tsx
import { render, within } from '@testing-library/react';
import type { ClaimCard } from '@/lib/document/desk-roster-derivation';
import { DeskClaimCard } from './desk-claim-card';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

jest.mock('@/components/document/command-bar', () => ({
  openLedger: jest.fn(),
}));

function card(over: Partial<ClaimCard> = {}): ClaimCard {
  return {
    stage: 'project',
    stageLabel: 'Project',
    custody: 'Your pen',
    band: 0,
    line: {
      engagementId: 'vandersteen',
      name: 'Vandersteen residence',
      stage: 'project',
      designerId: null,
      state: 'Anne Vandersteen · Procurement And Orders',
      overdueText: 'Overdue 6 days — Invoice 1042 · $17,500 overdue',
      mark: 'urgent',
      needKind: 'overdue_invoice',
      overdue: { isOverdue: true, days: 6 },
      jobHref: '/doc/vandersteen',
      act: { label: 'Send reminder', href: '/doc/vandersteen' },
      client: 'Anne Vandersteen',
      custody: 'Your pen',
      needOwner: 'designer',
      dueOn: '2026-08-12',
      valueText: '12 Aug',
      needText: 'Invoice 1042 · $17,500 overdue',
      motionText: null,
      projectId: null,
    },
    ...over,
  };
}

describe('DeskClaimCard — the six registers, in DOM order', () => {
  it('prints stage, custody, name, person, sentence, act — in that order', () => {
    // DOM order IS the screen-reader order, and the registers ARE an order.
    const { container } = render(
      <DeskClaimCard card={card()} tone="project" settle={false} />,
    );
    const registers = Array.from(
      container.querySelectorAll('[data-register]'),
    ).map((el) => el.getAttribute('data-register'));

    expect(registers).toEqual([
      'stage',
      'custody',
      'name',
      'person',
      'sentence',
      'act',
    ]);
  });

  it('carries the custody word beside the mark, and hides the mark', () => {
    const { container } = render(
      <DeskClaimCard card={card()} tone="project" settle={false} />,
    );
    const custody = container.querySelector('[data-register="custody"]')!;

    expect(custody).toHaveTextContent('Your pen');
    expect(custody.querySelector('[data-roster-mark]')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });

  it('marks urgent in terracotta-ink and quiet in mocha (D9)', () => {
    const { container: hot } = render(
      <DeskClaimCard card={card()} tone="project" settle={false} />,
    );
    const quietCard = card();
    const { container: cool } = render(
      <DeskClaimCard
        card={{ ...quietCard, line: { ...quietCard.line, mark: 'quiet' } }}
        tone="project"
        settle={false}
      />,
    );

    expect(
      hot.querySelector('[data-roster-mark]')!.getAttribute('data-mark-color'),
    ).toBe('var(--color-terracotta-ink)');
    expect(
      cool.querySelector('[data-roster-mark]')!.getAttribute('data-mark-color'),
    ).toBe('var(--color-mocha)');
  });

  it('names the job on the link, and on the act’s accessible name', () => {
    // Eleven cards otherwise announce eleven identical "Send reminder"s.
    const { container } = render(
      <DeskClaimCard card={card()} tone="project" settle={false} />,
    );

    expect(container.querySelector('[data-roster-name]')).toHaveAttribute(
      'href',
      '/doc/vandersteen',
    );
    expect(
      container.querySelector('[data-action-key^="roster-"]'),
    ).toHaveAttribute('aria-label', 'Send reminder — Vandersteen residence');
  });

  it('prints the overdue clause in terracotta-ink', () => {
    const { container } = render(
      <DeskClaimCard card={card()} tone="project" settle={false} />,
    );
    const sentence = container.querySelector('[data-register="sentence"]')!;

    expect(
      within(sentence as HTMLElement).getByText(/Overdue 6 days/),
    ).toHaveClass('text-[var(--color-terracotta-ink)]');
  });

  it('says the need’s own sentence when nothing is overdue', () => {
    const quiet = card();
    const { container } = render(
      <DeskClaimCard
        card={{ ...quiet, line: { ...quiet.line, overdueText: null } }}
        tone="project"
        settle={false}
      />,
    );

    expect(container.querySelector('[data-register="sentence"]')).toHaveTextContent(
      'Invoice 1042 · $17,500 overdue',
    );
  });

  it('lands the day’s line’s anchor on the card itself', () => {
    const { container } = render(
      <DeskClaimCard card={card()} tone="project" settle={false} />,
    );

    expect(container.querySelector('#roster-line-vandersteen')).not.toBeNull();
  });

  it('D10 — the custody and person lines do not swallow the click', () => {
    // The whole 88px upper block is one target: those two lines take
    // pointer-events:none so a click on them reaches the name link's overlay.
    // The trade-off — they are not selectable — is recorded in R143.
    const { container } = render(
      <DeskClaimCard card={card()} tone="project" settle={false} />,
    );

    for (const register of ['stage', 'custody', 'person']) {
      const el = container.querySelector(`[data-register="${register}"]`)!;
      expect(el.closest('[data-claim-inert]')).not.toBeNull();
    }
    // The sentence stays selectable — it is outside the block entirely.
    expect(
      container
        .querySelector('[data-register="sentence"]')!
        .closest('[data-claim-inert]'),
    ).toBeNull();
  });

  it('writes no shadow utility anywhere (D4)', () => {
    const { container } = render(
      <DeskClaimCard card={card()} tone="project" settle={false} />,
    );

    expect(container.querySelector('[data-claim-card]')!.className).toContain(
      'desk-claim-card',
    );
    for (const el of container.querySelectorAll('*')) {
      expect(el.className.toString()).not.toMatch(/\bshadow-/);
      expect(el.className.toString()).not.toMatch(/\bdrop-shadow\b/);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal test -- --ci \
  src/components/document/desk-claim-card.test.tsx
```

Expected: `Cannot find module './desk-claim-card'`.

- [ ] **Step 3: Add the R143 block to `globals.css`**

Values are lifted from the specimen (`three-cards-for-the-desk.html`, `.claim-card` / `.claim-grid` / `.ledger-row` / `.rest-head`) and translated to the portal's token names.

**The two rule weights, verified in `globals.css`.** `--doc-ink-border: rgba(44, 41, 38, 0.18)` is this portal's stock for the house sheet's `--hairline-strong` (globals.css says so in the `.da-terminal` disabled block) — it carries the ledger row's top rule and the at-rest head's rule, matching the specimen's `.ledger-row` and `.rest-head`. `--rule-hair: 1px solid rgba(44, 41, 38, 0.10)` is the lighter one and is a **full shorthand**, so it is spent as `border-top: var(--rule-hair)` — it carries the card's act band, matching the specimen's `.claim-band`. Do not swap them.

Append after the existing `.row-wash-score` rules:

```css
/* ── R143 · The Claim card and the at-rest ledger ────────────────────────────
   A card is a treatment for NEED, not a container for a job. Structure lives
   here rather than in arbitrary Tailwind because four of these rules cannot be
   written as utilities: the :has() focus wrap, the 899px collapse (not a
   Tailwind breakpoint), the forced-colors block, and pointer-events on the
   link zone. Colour and spacing stay on the components as classes. ────────── */

.desk-claims-grid {
  display: grid;
  gap: 24px;
  align-items: start;             /* a quiet card IS shorter, and says so */
  grid-template-columns: minmax(0, 1fr);
}
@media (min-width: 640px) {
  .desk-claims-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (min-width: 1024px) {
  .desk-claims-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}

.desk-claim-card {
  position: relative;
  background: var(--doc-paper);
  /* D4/R144 — the one boundary grey, 3.21:1 on this face. D4a: cards only. */
  border: 1px solid var(--color-card-edge);
  border-radius: 2px;
  padding: 20px 20px 0;
  overflow: hidden;               /* clips the wash's circle to the card */
}
.desk-claim-card > *:not(.row-wash) { position: relative; }

/* D10 — the WHOLE upper block is the link, not the name inside it: the
   roster's name link was the Desk's one sub-44px target. The overlay is the
   name link's own ::before, sized against .desk-claim-upper, so there is one
   accessible name and no nested interactive content.

   The stage plate, the custody row and the person line take pointer-events:
   none, so a click anywhere in the block reaches that overlay. They are
   therefore NOT selectable — the deliberate cost recorded in R143. Raising
   them with z-index instead would make the middle of a single target dead,
   which is a failure a user can neither see nor explain. The need sentence
   below the block keeps pointer events and stays selectable, as does every
   word of the at-rest ledger row. */
.desk-claim-upper { position: relative; min-height: 88px; }
.desk-claim-upper [data-claim-inert] { pointer-events: none; }
.desk-claim-upper [data-roster-name]::before {
  content: '';
  position: absolute;
  inset: -4px;
  border-radius: 2px;
}

.desk-claim-sentence,
.desk-claim-band { position: relative; z-index: 2; }
.desk-claim-band {
  margin-top: 16px;
  /* The LIGHTER rule (the specimen's --hairline). --rule-hair is a full
     shorthand value, so it is spent whole, never `1px solid var(--rule-hair)`. */
  border-top: var(--rule-hair);
  min-height: 44px;
  display: flex;
  align-items: center;
}
.desk-claim-band .da-act { width: 100%; justify-content: flex-start; }
/* Phone: no hover, so the act's own box carries the whole affordance. */
@media (max-width: 639px) {
  .desk-claim-band { min-height: 48px; }
}

/* The ring is drawn around the whole zone, so focus REVEALS the click area
   rather than outlining a word inside it. */
@supports selector(:has(*)) {
  .desk-claim-upper:has([data-roster-name]:focus-visible) {
    outline: 2px solid var(--color-clay-ink);
    outline-offset: 2px;
    border-radius: 2px;
  }
  .desk-claim-upper:has([data-roster-name]:focus-visible)
    [data-roster-name]:focus-visible { outline: none; }
  /* .row-wash-score fires on CARD hover, so hovering the act would also light
     the name. Two lit targets is a lie about where the click will land. */
  .desk-claim-card:has(.da-act:hover) .row-wash-score::after {
    background: var(--color-aged-oak);
  }
}

.desk-ledger-row {
  position: relative;
  display: grid;
  grid-template-columns: 24px 320px minmax(0, 1fr) 132px 96px;
  align-items: baseline;
  column-gap: 24px;
  padding: 24px 0;
  border-top: 1px solid var(--doc-ink-border);
  background: transparent;   /* D4a — a row is not a component boundary */
  overflow: hidden;          /* clips the wash's circle to the row */
}
/* The wash sits at z-index:-1 inside the row's own stacking context; giving
   the cells a position keeps them painting above it at every browser, and is
   what the specimen does. */
.desk-ledger-row > *:not(.row-wash) { position: relative; }
.desk-ledger-row [data-ledger-cell='sentence'] { max-width: 44ch; }
.desk-ledger-row [data-ledger-cell='value'],
.desk-ledger-row [data-ledger-cell='act'] { text-align: right; }
.desk-ledger-row [data-ledger-cell='mark'] { align-self: start; margin-top: 9px; }

/* The ledger degrades back into the roster row it came from. */
@media (max-width: 899px) {
  .desk-ledger-row {
    grid-template-columns: 16px minmax(0, 1fr);
    row-gap: 12px;
    column-gap: 12px;
  }
  .desk-ledger-row > *:not(.row-wash) { grid-column: 2; }
  .desk-ledger-row [data-ledger-cell='mark'] { grid-column: 1; }
  .desk-ledger-row [data-ledger-cell='sentence'] { max-width: none; }
  .desk-ledger-row [data-ledger-cell='value'] { text-align: left; }
}

/* F9 — the portal's first forced-colors block. In High Contrast a mark drawn
   as a background on an empty span vanishes entirely, and the wash repaints as
   a solid fill over the words. */
@media (forced-colors: active) {
  [data-roster-mark] {
    forced-color-adjust: none;
    background: transparent !important;
    border: 3.5px solid currentColor;
  }
  .row-wash { display: none; }
  .desk-claim-card, .desk-ledger-row { border-color: CanvasText; }
  .desk-claim-upper:has([data-roster-name]:focus-visible) {
    outline-color: Highlight;
  }
}
```

- [ ] **Step 4: Write `desk-claim-card.tsx`**

```tsx
'use client';

/**
 * The Claim card (R143 · D10).
 *
 * A card is a treatment for NEED, not a container for a JOB: it exists only
 * for a job with a claim on the studio's hand, and it earns the box by holding
 * two things a roster row could not — a need sentence that wants two lines,
 * and a name with an honest 44px target.
 *
 * Six registers, fixed order, one type role each. DOM order IS the
 * screen-reader order, so the order below is the design.
 */

import type { CSSProperties } from 'react';
import Link from 'next/link';
import type { SectionKey } from '@/lib/document/desk-derivation';
import type { ClaimCard } from '@/lib/document/desk-roster-derivation';
import { DocumentAction } from './document-action';
import { openLedger } from './command-bar';
import { RowWash, useRowWash, type RowWashTone } from './row-wash';

/** SP-20's device — a quiet need never wears the red letter's own ink.
 *  D9: both are the INK members of their pairs. The material pigments
 *  (#D4A090 at 2.13:1, #8B9CAD at 2.64:1) failed 1.4.11 as graphical objects;
 *  terracotta-ink reads 5.28:1 and mocha 7.86:1 on paper. */
export const MARK_COLOR = {
  urgent: 'var(--color-terracotta-ink)',
  quiet: 'var(--color-mocha)',
} as const;

/** The six saturated stage tabs (R126). Care is the seventh stage on the paper
 *  and has no pigment of its own, so it takes Install's. Exported so the grid,
 *  the ledger and the roster read one table rather than three copies. */
export const STAGE_TAB: Record<SectionKey, string> = {
  brief: 'bg-[var(--tab-brief)]',
  discovery: 'bg-[var(--tab-discovery)]',
  direction: 'bg-[var(--tab-direction)]',
  proposal: 'bg-[var(--tab-proposal)]',
  project: 'bg-[var(--tab-project)]',
  install: 'bg-[var(--tab-install)]',
  care: 'bg-[var(--tab-install)]',
};

export const STAGE_TONE: Record<SectionKey, RowWashTone> = {
  brief: 'brief',
  discovery: 'discovery',
  direction: 'direction',
  proposal: 'proposal',
  project: 'project',
  install: 'install',
  care: 'install',
};

const HEAD_TYPE =
  'font-mono text-[11px] font-medium uppercase tracking-[0.08em]';

/** `data-roster-line` was the row's identity; an `id` is what a link can land
 *  on, and the day's line is nothing but links into the Desk. */
export function rosterLineAnchorId(engagementId: string): string {
  return `roster-line-${engagementId}`;
}

export function DeskClaimCard({
  card,
  tone,
  index = 0,
  settle,
  tourAnchor,
}: {
  card: ClaimCard;
  tone: RowWashTone;
  index?: number;
  settle: boolean;
  tourAnchor?: string;
}) {
  const wash = useRowWash();
  const { line } = card;
  // The act's telemetry key carries the job: two jobs sharing a need kind are
  // two acts, not one fired twice.
  const actionKey = `roster-${line.needKind ?? 'open-the-job'}-${line.engagementId}`;
  const ariaLabel = `${line.act.label} — ${line.name}`;
  // Secondary where the act moves a reminder or opens money; tertiary where it
  // only opens something. Consequence, not emphasis.
  const variant = line.act.ledger ? 'secondary' : 'tertiary';

  return (
    <li
      {...wash}
      id={rosterLineAnchorId(line.engagementId)}
      data-claim-card={line.engagementId}
      data-tour-anchor={tourAnchor}
      className={`desk-claim-card has-wash${settle ? ' desk-settle' : ''}`}
      style={settle ? ({ '--i': index } as CSSProperties) : undefined}
    >
      <RowWash tone={tone} />
      <div className="desk-claim-upper">
        {/* D10 — everything in this wrapper is pointer-events:none, so the
            whole block is the name link's target. The cost is that these two
            lines are not selectable; R143 records why that is the right side
            of the trade. */}
        <span data-claim-inert className="block">
          <span className="flex flex-wrap items-center justify-between gap-2">
            {/* 1 · stage — one word on the plate, never "· 3" on a card. */}
            <span
              data-register="stage"
              className={`inline-flex items-center rounded-[3px] px-2.5 py-[3px] text-white ${HEAD_TYPE} ${STAGE_TAB[card.stage]}`}
            >
              {card.stageLabel}
            </span>
            {/* 2 · custody — whose hand, beside the 7px mark. */}
            <span
              data-register="custody"
              className={`inline-flex items-center gap-2 text-[var(--text-subtle)] ${HEAD_TYPE}`}
            >
              <span
                aria-hidden="true"
                data-roster-mark
                data-mark-tone={line.mark ?? undefined}
                data-mark-color={line.mark ? MARK_COLOR[line.mark] : undefined}
                className="inline-block h-[7px] w-[7px] shrink-0 rounded-full"
                style={
                  line.mark ? { backgroundColor: MARK_COLOR[line.mark] } : undefined
                }
              />
              {card.custody}
            </span>
          </span>
          {/* 4 · person · phase — no label, no ordinal, no "Client:". */}
          <span
            data-register="person"
            className="mt-1 block text-[14px] leading-[1.5] text-[var(--text-muted)] [overflow-wrap:anywhere]"
          >
            {line.state}
          </span>
        </span>
        {/* 3 · name — wraps, never truncates. Rendered after the inert wrapper
            in the tree but ordered above the person line by the grid below, so
            DOM order stays stage → custody → name → person. */}
        <span data-register="name" className="order-2 mt-2 block">
          <Link
            href={line.jobHref}
            data-roster-name
            className="row-wash-score min-w-0 font-heading text-[20px] font-medium leading-[1.3] text-[var(--text-primary)] no-underline transition-colors [overflow-wrap:anywhere] motion-reduce:transition-none"
          >
            {line.name}
          </Link>
        </span>
      </div>
      {/* 5 · the one true sentence — the overdue clause in the red letter's own
          ink, and never a growing day count beside a date. Selectable. */}
      <p
        data-register="sentence"
        className="desk-claim-sentence mt-3 text-[15px] leading-[1.5] text-[var(--text-muted)] [overflow-wrap:anywhere]"
      >
        {line.overdueText ? (
          <span data-roster-overdue className="text-[var(--color-terracotta-ink)]">
            {line.overdueText}
          </span>
        ) : (
          line.needText
        )}
      </p>
      {/* 6 · the one act, never two. */}
      <div data-register="act" className="desk-claim-band">
        {line.act.ledger ? (
          <DocumentAction
            actionKey={actionKey}
            aria-label={ariaLabel}
            variant={variant}
            onClick={() =>
              openLedger(line.act.ledger!.name, line.act.ledger!.context)
            }
          >
            {line.act.label}
          </DocumentAction>
        ) : (
          <DocumentAction
            actionKey={actionKey}
            aria-label={ariaLabel}
            variant={variant}
            href={line.act.href}
          >
            {line.act.label}
          </DocumentAction>
        )}
      </div>
    </li>
  );
}
```

> **The `order-2` above needs a flex or grid parent to mean anything.** Give `.desk-claim-upper` `display: flex; flex-direction: column;` in the stylesheet block from Step 3 and the visual order becomes stage/custody → name → person while the DOM order stays stage → custody → name → person. **If that proves awkward, the simpler correct alternative is to split the inert wrapper into two** — one around the stage/custody row, one around the person line, with the name between them in plain DOM order and no `order` at all. Prefer the two-wrapper form; it needs no flex ordering and keeps DOM and visual order identical. Whichever you pick, the register test in Step 1 is the arbiter: `[data-register]` must read `stage, custody, name, person, sentence, act` in document order, and all three of stage/custody/person must sit inside a `[data-claim-inert]`.

- [ ] **Step 5: Run the card test to verify it passes**

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal test -- --ci \
  src/components/document/desk-claim-card.test.tsx \
  src/lib/document/__tests__/desk-focus-ring.test.ts \
  src/lib/document/__tests__/contrast.test.ts
```

Expected: 3 suites pass. The focus-ring guard now sees a real `desk-claim-card.tsx` instead of recording it absent.

- [ ] **Step 6: Gate — the type-check is still RED, and only in `desk-roster.tsx`**

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal type-check
```

Expected: the **same** `desk-roster.tsx` errors Task 4 left, and no new ones. This task adds a new module that nothing imports yet, so it cannot close Task 4's redness and must not add to it.

- [ ] **Step 7: Commit**

```bash
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards add \
  apps/designer-portal/src/app/globals.css \
  apps/designer-portal/src/components/document/desk-claim-card.tsx \
  apps/designer-portal/src/components/document/desk-claim-card.test.tsx
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards commit -m "feat(desk): the Claim card, and the R143 stylesheet block" -- \
  apps/designer-portal/src/app/globals.css \
  apps/designer-portal/src/components/document/desk-claim-card.tsx \
  apps/designer-portal/src/components/document/desk-claim-card.test.tsx
```

Expected: 3 files.

---

## Task 6 (was 4b) (D8): The at-rest ledger row, and the claims grid

**Files:**
- Create: `apps/designer-portal/src/components/document/desk-ledger-row.tsx`
- Create: `apps/designer-portal/src/components/document/desk-ledger-row.test.tsx`
- Create: `apps/designer-portal/src/components/document/desk-claims.tsx`

**Interfaces:**

- **Consumes** from Task 5: `rosterLineAnchorId`, `STAGE_TONE`. From Task 4: the `ClaimCard` type. From Task 3: `RosterLine`'s `custody`, `valueText`, `motionText`.

- **Produces:**

```tsx
// desk-ledger-row.tsx
export function DeskLedgerRow(props: {
  line: RosterLine;
  tone: RowWashTone;
}): JSX.Element;

// desk-claims.tsx
export function DeskClaimsGrid(props: {
  cards: readonly ClaimCard[];
  settle: boolean;
  /** The running index across the whole Desk, so the settle stagger does not
   *  restart per person group. */
  startIndex?: number;
  /** Set on the first card only, so the walkthrough's fourth stop lands. */
  firstTourAnchor?: string;
  /** The id the day's line's `more` link lands on. */
  id?: string;
}): JSX.Element;
```

- **Produces**, the DOM contract: `[data-ledger-row="<engagementId>"]` on the `<li>`; `[data-ledger-cell]` on each of the five cells in order (`mark`, `name`, `sentence`, `value`, `act`).

- [ ] **Step 1: Write the failing ledger-row test**

Create `apps/designer-portal/src/components/document/desk-ledger-row.test.tsx`:

```tsx
import { render } from '@testing-library/react';
import type { RosterLine } from '@/lib/document/desk-roster-derivation';
import { DeskLedgerRow } from './desk-ledger-row';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

jest.mock('@/components/document/command-bar', () => ({
  openLedger: jest.fn(),
}));

function line(over: Partial<RosterLine> = {}): RosterLine {
  return {
    engagementId: 'reinhardt',
    name: 'Reinhardt lake house',
    stage: 'discovery',
    designerId: null,
    state: 'Reinhardt · Site Visit · quiet · nothing needs your hand',
    overdueText: null,
    mark: null,
    needKind: null,
    overdue: { isOverdue: false, days: 0 },
    jobHref: '/doc/reinhardt',
    act: { label: 'Open the job', href: '/doc/reinhardt' },
    client: 'Reinhardt',
    custody: 'At rest',
    needOwner: null,
    dueOn: null,
    valueText: null,
    needText: null,
    motionText: null,
    projectId: null,
    ...over,
  };
}

describe('DeskLedgerRow — the at-rest row', () => {
  it('prints the five cells in the ledger’s own column order', () => {
    const { container } = render(<DeskLedgerRow line={line()} tone="discovery" />);
    const cells = Array.from(
      container.querySelectorAll('[data-ledger-cell]'),
    ).map((el) => el.getAttribute('data-ledger-cell'));

    expect(cells).toEqual(['mark', 'name', 'sentence', 'value', 'act']);
  });

  it('wears the at-rest ring, never a filled mark', () => {
    const { container } = render(<DeskLedgerRow line={line()} tone="discovery" />);
    const mark = container.querySelector('[data-roster-mark]')!;

    expect(mark.getAttribute('data-mark-tone')).toBeNull();
    expect(mark.getAttribute('data-mark-color')).toBeNull();
    expect(mark).toHaveAttribute('aria-hidden', 'true');
  });

  it('carries the custody word and the person · phase run under the name', () => {
    const { container } = render(<DeskLedgerRow line={line()} tone="discovery" />);
    const nameCell = container.querySelector('[data-ledger-cell="name"]')!;

    expect(nameCell).toHaveTextContent('At rest');
    expect(nameCell).toHaveTextContent('Reinhardt lake house');
    expect(nameCell).toHaveTextContent('Site Visit');
  });

  it('prints the in-motion sentence where the job has one', () => {
    const { container } = render(
      <DeskLedgerRow
        line={line({ motionText: 'With client since 4 Aug' })}
        tone="discovery"
      />,
    );

    expect(container.querySelector('[data-ledger-cell="sentence"]')).toHaveTextContent(
      'With client since 4 Aug',
    );
  });

  it('says nothing needs your hand where the job is not in motion', () => {
    const { container } = render(<DeskLedgerRow line={line()} tone="discovery" />);

    expect(container.querySelector('[data-ledger-cell="sentence"]')).toHaveTextContent(
      'Nothing needs your hand.',
    );
  });

  it('prints the in-motion date in the value column, tabular (D8)', () => {
    const { container } = render(
      <DeskLedgerRow
        line={line({ motionText: 'With client since 4 Aug', valueText: '4 Aug' })}
        tone="discovery"
      />,
    );
    const value = container.querySelector('[data-ledger-cell="value"]')!;

    expect(value).toHaveTextContent('4 Aug');
    expect(value.className).toContain('tabular-nums');
  });

  it('renders an empty value cell rather than dropping the column', () => {
    // The column is the grid that makes a ledger a ledger: figures line up
    // down the page only if the cell is always there.
    const { container } = render(<DeskLedgerRow line={line()} tone="discovery" />);

    expect(container.querySelector('[data-ledger-cell="value"]')!.textContent).toBe('');
  });

  it('names the job on the act, and writes no shadow anywhere', () => {
    const { container } = render(<DeskLedgerRow line={line()} tone="discovery" />);

    expect(container.querySelector('[data-action-key^="roster-"]')).toHaveAttribute(
      'aria-label',
      'Open the job — Reinhardt lake house',
    );
    for (const el of container.querySelectorAll('*')) {
      expect(el.className.toString()).not.toMatch(/\bshadow-/);
    }
  });

  it('lands the day’s line’s anchor on the row', () => {
    const { container } = render(<DeskLedgerRow line={line()} tone="discovery" />);

    expect(container.querySelector('#roster-line-reinhardt')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal test -- --ci \
  src/components/document/desk-ledger-row.test.tsx
```

Expected: `Cannot find module './desk-ledger-row'`.

- [ ] **Step 3: Write `desk-ledger-row.tsx`**

```tsx
'use client';

/**
 * The at-rest ledger row (R143 · D8).
 *
 * The roster row given an internal grid. Its win over the row it replaces is
 * that dates align down the page across forty rows — the one thing a wrapping
 * row could never do. It takes no card edge (D4a): a row is not a component
 * boundary, and it keeps the hairline it always had. Every word in it stays
 * selectable — nothing overlays anything here.
 */

import Link from 'next/link';
import type { RosterLine } from '@/lib/document/desk-roster-derivation';
import { DocumentAction } from './document-action';
import { openLedger } from './command-bar';
import { RowWash, useRowWash, type RowWashTone } from './row-wash';
import { rosterLineAnchorId } from './desk-claim-card';

const AT_REST_SENTENCE = 'Nothing needs your hand.';

export function DeskLedgerRow({
  line,
  tone,
}: {
  line: RosterLine;
  tone: RowWashTone;
}) {
  const wash = useRowWash();
  const actionKey = `roster-${line.needKind ?? 'open-the-job'}-${line.engagementId}`;
  const ariaLabel = `${line.act.label} — ${line.name}`;

  return (
    <li
      {...wash}
      id={rosterLineAnchorId(line.engagementId)}
      data-ledger-row={line.engagementId}
      className="desk-ledger-row has-wash"
    >
      <RowWash tone={tone} />
      {/* A job at rest wears a ring, never a filled mark: the two marks are
          two registers, and a third would be a third urgency tier (C4/D8). */}
      <span
        aria-hidden="true"
        data-roster-mark
        data-ledger-cell="mark"
        className="inline-block h-[7px] w-[7px] shrink-0 rounded-full border border-[color:var(--text-faint)]"
      />
      <span data-ledger-cell="name" className="min-w-0">
        <span className="block font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-subtle)]">
          {line.custody}
        </span>
        <Link
          href={line.jobHref}
          data-roster-name
          className="row-wash-score mt-1 block min-w-0 font-heading text-[20px] font-medium leading-[1.3] text-[var(--text-primary)] no-underline transition-colors [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay-ink)] motion-reduce:transition-none"
        >
          {line.name}
        </Link>
        <span className="mt-1 block text-[14px] leading-[1.5] text-[var(--text-muted)] [overflow-wrap:anywhere]">
          {line.state}
        </span>
      </span>
      <span
        data-ledger-cell="sentence"
        className="min-w-0 text-[14px] leading-[1.5] text-[var(--text-muted)] [overflow-wrap:anywhere]"
      >
        {line.motionText ?? AT_REST_SENTENCE}
      </span>
      {/* Tabular figures: the column exists so that the moment one row carries
          a date, it lines up with every other one that does. */}
      <span
        data-ledger-cell="value"
        className="font-mono text-[15px] leading-[1.5] tracking-[0.02em] tabular-nums text-[var(--text-primary)]"
      >
        {line.valueText ?? ''}
      </span>
      <span data-ledger-cell="act">
        {line.act.ledger ? (
          <DocumentAction
            actionKey={actionKey}
            aria-label={ariaLabel}
            variant="tertiary"
            onClick={() =>
              openLedger(line.act.ledger!.name, line.act.ledger!.context)
            }
          >
            {line.act.label}
          </DocumentAction>
        ) : (
          <DocumentAction
            actionKey={actionKey}
            aria-label={ariaLabel}
            variant="tertiary"
            href={line.act.href}
          >
            {line.act.label}
          </DocumentAction>
        )}
      </span>
    </li>
  );
}
```

- [ ] **Step 4: Write `desk-claims.tsx`**

```tsx
'use client';

/**
 * The claims grid (R143 · D3).
 *
 * Three columns at ≥1024, two at 640–1023, one below — the arithmetic is
 * forced: 390 − 48 padding − 48 gutters ÷ 3 is a 98px card, and a Playfair
 * name cannot wrap into it without truncating, which is banned.
 *
 * `align-items: start` (globals.css) is the point: a quiet card is shorter
 * than a loud one, and the page has to look like that.
 */

import type { ClaimCard } from '@/lib/document/desk-roster-derivation';
import { DeskClaimCard, STAGE_TONE } from './desk-claim-card';

export function DeskClaimsGrid({
  cards,
  settle,
  startIndex = 0,
  firstTourAnchor,
  id,
}: {
  cards: readonly ClaimCard[];
  settle: boolean;
  startIndex?: number;
  firstTourAnchor?: string;
  id?: string;
}) {
  return (
    <ul id={id} className="desk-claims-grid">
      {cards.map((card, position) => (
        <DeskClaimCard
          key={card.line.engagementId}
          card={card}
          // The wash follows the JOB's stage, never its group's: By person
          // regroups the same cards away from their stage.
          tone={STAGE_TONE[card.line.stage]}
          index={startIndex + position}
          settle={settle}
          tourAnchor={position === 0 ? firstTourAnchor : undefined}
        />
      ))}
    </ul>
  );
}
```

- [ ] **Step 5: Run the row test to verify it passes**

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal test -- --ci \
  src/components/document/desk-ledger-row.test.tsx \
  src/components/document/desk-claim-card.test.tsx \
  src/lib/document/__tests__/desk-focus-ring.test.ts
```

Expected: 3 suites pass, and the focus-ring guard now sees all four Desk files present.

- [ ] **Step 6: Gate — the type-check is still RED, and only in `desk-roster.tsx`**

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal type-check
```

Expected: the same `desk-roster.tsx` errors, unchanged in kind and count.

- [ ] **Step 7: Commit**

```bash
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards add \
  apps/designer-portal/src/components/document/desk-ledger-row.tsx \
  apps/designer-portal/src/components/document/desk-ledger-row.test.tsx \
  apps/designer-portal/src/components/document/desk-claims.tsx
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards commit -m "feat(desk): the at-rest ledger row and the claims grid" -- \
  apps/designer-portal/src/components/document/desk-ledger-row.tsx \
  apps/designer-portal/src/components/document/desk-ledger-row.test.tsx \
  apps/designer-portal/src/components/document/desk-claims.tsx
```

Expected: 3 files.

---
## Task 7 (was 4c) (D2, D7): The composition — `DeskRoster` holds both halves

The container keeps the name `DeskRoster` to limit churn: the Desk page's import, its `data-testid="desk-roster"` and its tour anchors all stay as they are. This is the task that closes Task 4's red type-check.

**Files:**
- Modify: `apps/designer-portal/src/components/document/desk-roster.tsx` (full replacement, printed below)
- Modify: `apps/designer-portal/src/components/document/desk-roster.test.tsx`
- Modify: `apps/designer-portal/src/components/document/desk-roster-settle.test.tsx`

**Interfaces:**

- **Consumes** from Task 4: `deriveDeskClaims`, `groupClaimsByPerson`, `CLAIMS_ANCHOR_ID`, and the types `ClaimCard`, `ClaimPersonGroup`, `DeskClaims`, `DayLinePart`, `DeskDayLine`. From the pre-existing module: `deriveRosterPeople`, `facetHeading`, `groupRosterByPerson`, `NOTHING_NEEDS_YOU`, and the types `DeskRoster as DeskRosterModel`, `RosterGroup`, `RosterLine`, `RosterMember`, **`RosterPersonGroup`**. From Tasks 5 and 6: `DeskClaimCard`'s `STAGE_TAB` / `STAGE_TONE` / `rosterLineAnchorId`, `DeskClaimsGrid`, `DeskLedgerRow`. From the existing tree: `SectionEyebrow`, `DocumentAction`, `DocumentActionGroup`, `useAnsweredNotes`.

- **Produces:**

```tsx
export { rosterLineAnchorId } from './desk-claim-card';

export function DeskRoster(props: {
  roster: DeskRosterModel;
  studioMembers?: readonly RosterMember[];
}): JSX.Element;
```

`DeskRosterModel` is the file's existing local alias for the exported `DeskRoster` **type**, imported as `DeskRoster as DeskRosterModel` so the type and this component can share a name across modules. The alias predates this program; it is kept.

- [ ] **Step 1: Decide each of the eleven existing describes, and the two anchor assertions**

`desk-roster.test.tsx` holds eleven `describe` blocks. Every one is decided here — none is left to drift.

| Line | `describe` | Verdict | What changes |
|---|---|---|---|
| 107 | `DeskRoster — the header` | **Keep** | Asserts the eyebrow heading and the two facet labels. Neither moves. |
| 119 | `DeskRoster — the density rule` | **Retarget** | It asserts one `[data-roster-line]` per job and no card. Rewrite as *"the two halves"* — see Step 3. |
| 176 | `DeskRoster — the marks` | **Retarget** | `[data-roster-mark]` now appears on cards and rows both; the locator is unchanged but the expected count changes with the new fixture. Assert the card's filled mark and the row's ring separately. |
| 203 | `DeskRoster — the acts` | **Retarget** | Replace `[data-roster-line]` with `[data-claim-card], [data-ledger-row]`. The one-act-per-job and `aria-label` assertions stand. |
| 253 | `DeskRoster — an empty desk` | **Keep + extend** | Its `desk-folio` assertion at line 271 is the empty-Desk anchor and stands. Add the zero-cards case in Step 4. |
| 276 | `DeskRoster — the stage tabs (R126)` | **Retarget** | Stage plates now head the **ledger half only**; the card half has no plates of its own (each card wears its stage). Assert `[data-stage-tab]` appears over the ledger and not over the grid. |
| 335 | `DeskRoster — the hover wash (R126)` | **Retarget** | `.has-wash` / `RowWash` now ride the card and the row. Replace the `[data-roster-line]` locator with `[data-claim-card], [data-ledger-row]`; the tone assertions stand. |
| 373 | `DeskRoster — the marks are unchanged by the wash` | **Retarget** | Already updated to the ink values in Task 1. Change only its locator to `[data-claim-card] [data-roster-mark]` so it reads the two marked jobs, not the at-rest ring. |
| 389 | `DeskRoster — no shadow reaches the roster` | **Retarget** | Rename to *"no shadow reaches either half"*; the assertion body is unchanged and already scans every element. |
| 399 | `DeskRoster — the day's line (IA-05)` | **Retarget** | The `more` link's href becomes `#desk-claims`, and the quoted lines are now cards. Rewrite its assertions against the new fixture — see Step 3. |
| 565 | `DeskRoster — the facets (IA-11 / IA-12)` | **Retarget** | *Only what needs me* now hides the ledger rather than narrowing lines; *By person* regroups both halves. Its `desk-folio` assertion at line 678 is the empty-facet anchor and stands. |

**Keep list — DOM that must survive untouched**, because other files and specs read it:

- `<section aria-labelledby="every-job" data-testid="desk-roster" data-tour-anchor="desk-needs-your-hand">` (currently `desk-roster.tsx:322–325`) — the `data-testid` is read by four e2e specs and the `data-tour-anchor` by the Desk walkthrough.
- `<span id="every-job">` inside `SectionEyebrow` — `desk-error-state.spec.ts` and `wp3-screenshots.spec.ts` both assert on it.
- `<DocumentActionGroup surfaceKey="desk" regionKey="every-job">` — `action-visibility.spec.ts` asserts exactly one `[role="group"][data-action-region="every-job"]` and that it elects no leader.
- `data-tour-anchor="desk-folio"` present in **every** state — populated, facet-emptied, and wholly empty.
- `data-roster-facet-empty` and the two empty-state sentences.
- `rosterLineAnchorId(...)` as each card's and each row's `id`.

- [ ] **Step 2: Write the new fixture**

In `desk-roster.test.tsx`'s `roster()` builder, append a third, unmarked line to the `project` group's `lines` array so the ledger half has something to print:

```tsx
          {
            engagementId: 'reinhardt',
            name: 'Reinhardt lake house',
            stage: 'project',
            designerId: LEAH,
            state: 'Reinhardt · Site Visit · quiet · nothing needs your hand',
            overdueText: null,
            mark: null,
            needKind: null,
            overdue: { isOverdue: false, days: 0 },
            jobHref: '/doc/reinhardt',
            act: { label: 'Open the job', href: '/doc/reinhardt' },
            custody: 'At rest',
            needOwner: null,
            motionText: 'With client since 4 Aug',
            valueText: '4 Aug',
          },
```

and bump that group's `count` to `2`, the model's `liveCount` to `3`, and its `heading` to `'Every job · 3 live · 1 overdue'`.

- [ ] **Step 3: Write the failing composition tests**

Append to `desk-roster.test.tsx`:

```tsx
describe('DeskRoster — R143, the Desk in two halves', () => {
  it('cards the two marked jobs and leaves the quiet one a ledger row', () => {
    const { container } = render(<DeskRoster roster={roster()} />);

    // D3's rank: Vandersteen is designer-owned and overdue (band 0), Byrne is
    // client-held (band 2).
    expect(
      Array.from(container.querySelectorAll('[data-claim-card]')).map((el) =>
        el.getAttribute('data-claim-card'),
      ),
    ).toEqual(['vandersteen', 'byrne']);
    expect(
      Array.from(container.querySelectorAll('[data-ledger-row]')).map((el) =>
        el.getAttribute('data-ledger-row'),
      ),
    ).toEqual(['reinhardt']);
  });

  it('heads the ledger half with its count', () => {
    render(<DeskRoster roster={roster()} />);

    expect(screen.getByText('At rest · 1 job')).toBeInTheDocument();
  });

  it('keeps the desk-folio tour anchor on the first card', () => {
    const { container } = render(<DeskRoster roster={roster()} />);

    expect(
      container
        .querySelector('[data-tour-anchor="desk-folio"]')!
        .getAttribute('data-claim-card'),
    ).toBe('vandersteen');
  });

  it('keeps the section’s testid and walkthrough anchor', () => {
    const { container } = render(<DeskRoster roster={roster()} />);
    const section = container.querySelector('[data-testid="desk-roster"]')!;

    expect(section).toHaveAttribute('data-tour-anchor', 'desk-needs-your-hand');
    expect(section.querySelector('#every-job')).not.toBeNull();
  });

  it('heads only the ledger half with stage plates', () => {
    const { container } = render(<DeskRoster roster={roster()} />);
    const grid = container.querySelector('#desk-claims')!;

    expect(container.querySelectorAll('[data-stage-tab]').length).toBeGreaterThan(0);
    expect(grid.querySelectorAll('[data-stage-tab]')).toHaveLength(0);
  });

  it('hides the ledger half under Only what needs me', async () => {
    const user = userEvent.setup();
    const { container } = render(<DeskRoster roster={roster()} />);

    await user.click(screen.getByRole('button', { name: 'Only what needs me' }));

    expect(container.querySelectorAll('[data-ledger-row]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-claim-card]')).toHaveLength(2);
    // IX18 — the label never changes with state; aria-pressed carries it.
    expect(
      screen.getByRole('button', { name: 'Only what needs me' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('regroups both halves by person under By person', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DeskRoster roster={roster()} studioMembers={STUDIO} />,
    );

    await user.click(screen.getByRole('button', { name: 'By person' }));

    // Leah is the principal: the unassigned Vandersteen card lands with her,
    // as does her own at-rest Reinhardt row; Anneke keeps her Byrne card.
    expect(container.querySelectorAll('[data-person-plate]').length).toBe(3);
    expect(container.querySelectorAll('[data-claim-card]')).toHaveLength(2);
    expect(container.querySelectorAll('[data-ledger-row]')).toHaveLength(1);
  });

  it('points the day’s line’s more-link at the claims grid', () => {
    const { container } = render(<DeskRoster roster={roster()} />);
    const more = container.querySelector('[data-day-line-more]');

    // Two cards and up to three quoted lines, so there is no more-link on this
    // fixture — the assertion is that if one exists it lands on the grid.
    if (more) expect(more).toHaveAttribute('href', '#desk-claims');
    expect(container.querySelector('#desk-claims')).not.toBeNull();
  });
});

describe('DeskRoster — no shadow reaches either half', () => {
  it('writes no shadow utility on any element it prints', () => {
    const { container } = render(<DeskRoster roster={roster()} />);

    for (const el of container.querySelectorAll('*')) {
      expect(el.className.toString()).not.toMatch(/\bshadow-/);
      expect(el.className.toString()).not.toMatch(/\bdrop-shadow\b/);
    }
  });
});
```

Delete the pre-existing `describe('DeskRoster — no shadow reaches the roster')` at line 389 in favour of the block above — keeping two would assert the same thing twice under two names.

- [ ] **Step 4: Write the failing zero-cards anchor test**

When nothing claims her hand but jobs are still live, the grid renders empty and `firstTourAnchor` never lands. The walkthrough's fourth stop would then point at nothing, on the quietest Desk — the one a new studio sees first.

Append to `describe('DeskRoster — an empty desk')`:

```tsx
  it('keeps the desk-folio anchor when there are no cards, only rows', () => {
    // The quietest live Desk: every job at rest. The walkthrough's fourth stop
    // has to land on something, and the at-rest head is what is there.
    const quiet = roster();
    const allQuiet = {
      ...quiet,
      overdueCount: 0,
      heading: 'Every job · 3 live · 0 overdue',
      groups: quiet.groups.map((group) => ({
        ...group,
        lines: group.lines.map((line) => ({
          ...line,
          mark: null,
          needKind: null,
          needOwner: null,
          custody: 'At rest',
          overdueText: null,
          overdue: { isOverdue: false, days: 0 },
        })),
      })),
    };
    const { container } = render(<DeskRoster roster={allQuiet} />);

    expect(container.querySelectorAll('[data-claim-card]')).toHaveLength(0);
    expect(container.querySelectorAll('[data-ledger-row]')).toHaveLength(3);
    expect(
      container.querySelector('[data-tour-anchor="desk-folio"]'),
    ).not.toBeNull();
  });
```

- [ ] **Step 5: Retarget `desk-roster-settle.test.tsx`**

Change its row selector from `container.querySelectorAll<HTMLElement>('[data-roster-line]')` to:

```tsx
    container.querySelectorAll<HTMLElement>('[data-claim-card], [data-ledger-row]')
```

Both `desk-settle` assertions stand unchanged. Check its three fixture lines: only those with `mark !== null` settle as cards, so if all three are unmarked the suite exercises rows only — give at least one a `mark: 'quiet'` and `needOwner: 'designer'` so both halves are covered by the stagger assertion.

- [ ] **Step 6: Run the three suites to verify they fail**

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal test -- --ci \
  src/components/document/desk-roster.test.tsx \
  src/components/document/desk-roster-settle.test.tsx
```

Expected: failures on the missing `[data-claim-card]` elements, and the runtime error from `DeskRoster` still calling `deriveDeskDayLine`'s old signature.

- [ ] **Step 7: Replace `desk-roster.tsx` in full**

This is the complete new file. Nothing in it is elided.

```tsx
'use client';

/**
 * The Desk — every live job, in two halves (R143).
 *
 * R143 amends the density rule that built this: one line per job in the
 * at-rest ledger; a job with a claim on the studio's hand takes a Claim card.
 * Headings never fold; nothing is folded on first paint; the card is the
 * emphasis granted to a claim, never a container granted to every job.
 *
 * The two facets compose over both halves (D2): "Only what needs me" hides the
 * ledger — the cards already ARE what needs her — and "By person" regroups
 * both. No view switcher: a switcher is one step from the dashboard the vision
 * refuses.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  CLAIMS_ANCHOR_ID,
  deriveDeskClaims,
  deriveRosterPeople,
  facetHeading,
  groupClaimsByPerson,
  groupRosterByPerson,
  NOTHING_NEEDS_YOU,
  type ClaimPersonGroup,
  type DayLinePart,
  type DeskRoster as DeskRosterModel,
  type RosterGroup,
  type RosterMember,
  type RosterPersonGroup,
} from '@/lib/document/desk-roster-derivation';
import { useAnsweredNotes } from '@/hooks/use-answered-notes';
import { SectionEyebrow } from './section-eyebrow';
import { DocumentAction, DocumentActionGroup } from './document-action';
import { DeskClaimsGrid } from './desk-claims';
import { DeskLedgerRow } from './desk-ledger-row';
import { STAGE_TAB, STAGE_TONE } from './desk-claim-card';

/** Moved to desk-claim-card.tsx, where both halves can reach it. Re-exported
 *  here so this module's existing importers keep resolving. */
export { rosterLineAnchorId } from './desk-claim-card';

/** The house sheet's `.act--inline` grammar (§F-D): an act living inside a
 *  sentence — the surrounding family, size, case and colour, no control box,
 *  a 1px rest rule 3px under the baseline that raises to --text-faint on
 *  hover.
 *
 *  It carries the sheet's own focus rule for every tier: the 2px ring AND the
 *  proofreader's caret, which fades in on focus. The sheet sets the caret at
 *  `left: 1px`, calibrated for a padded control box; an inline act has no
 *  padding, so at 1px the mark would land on the word's first letter. It is
 *  set just outside the word instead — a proofreader marks the margin. Every
 *  inline act below carries an `aria-label`, which is what keeps the caret's
 *  pseudo-content out of the accessible name (opacity:0 does not exempt it).
 *
 *  D9: the ring is clay-INK (5.61:1). The base clay it carried before read
 *  2.18:1 and was the same defect the roster's mark carried. */
const INLINE_ACT =
  "relative border-b border-[color:var(--color-aged-oak)] pb-[3px] text-inherit no-underline transition-colors before:pointer-events-none before:absolute before:left-[-0.7em] before:top-1/2 before:-translate-y-1/2 before:text-[14px] before:leading-none before:text-[color:var(--color-quiet-ink)] before:opacity-0 before:transition-opacity before:duration-150 before:content-['‸'] hover:border-b-[1.5px] hover:border-[color:var(--text-faint)] hover:pb-[2.5px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay-ink)] focus-visible:before:opacity-100 motion-reduce:transition-none motion-reduce:before:transition-none";

const PERSON_PLATE_CLASS =
  'mb-1.5 inline-flex items-center rounded-[3px] bg-[var(--doc-rail-stock)] px-2.5 py-[3px] font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-primary)]';

const STAGE_PLATE_CLASS =
  'mb-1.5 inline-flex items-center rounded-[3px] px-2.5 py-[3px] font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-white';

/** The Desk settles in ONCE per document session. A remount on return to
 *  /desk must not replay it, so the flag lives on the module, not the tree. */
let settledOnce = false;

function useSettleOnce(): boolean {
  const [settle] = useState(() => !settledOnce);
  // Flipped after the first commit, never during render: React's dev
  // double-render would otherwise consume the flag before the DOM exists.
  useEffect(() => {
    settledOnce = true;
  }, []);
  return settle;
}

function DayLineText({ parts }: { parts: readonly DayLinePart[] }) {
  return (
    <>
      {parts.map((part, index) => {
        if (part.kind === 'job') {
          return (
            <a
              key={`${part.kind}-${index}`}
              href={`#roster-line-${part.engagementId}`}
              // Two links can carry one job's name on this page — the card's
              // own link opens the job, this one only moves to the card — so
              // the accessible name says which is which.
              aria-label={`${part.text} — the card below`}
              className={INLINE_ACT}
            >
              {part.text}
            </a>
          );
        }
        if (part.kind === 'overdue') {
          return (
            <span
              key={`${part.kind}-${index}`}
              data-day-line-overdue
              className="text-[var(--color-terracotta-ink)]"
            >
              {part.text}
            </span>
          );
        }
        return <span key={`${part.kind}-${index}`}>{part.text}</span>;
      })}
    </>
  );
}

/** The facet acts carry the running head's own type (11px, 500, .08em), which
 *  the tertiary variant sets at 12px/300/.1em — `!` so the override does not
 *  depend on the order Tailwind happens to emit two arbitrary sizes in. */
const FACET_CLASS =
  '!text-[11px] !font-medium !tracking-[0.08em] aria-pressed:!text-[var(--text-primary)]';

function FacetAct({
  actionKey,
  pressed,
  onToggle,
  children,
}: {
  actionKey: string;
  pressed: boolean;
  onToggle: () => void;
  children: string;
}) {
  return (
    <DocumentAction
      actionKey={actionKey}
      surfaceKey="desk"
      regionKey="every-job-facets"
      variant="tertiary"
      className={FACET_CLASS}
      aria-pressed={pressed}
      onClick={onToggle}
    >
      {children}
    </DocumentAction>
  );
}

/** The at-rest half. Its head carries the count because a quantity of WORK is
 *  the one count this surface permits — never a quantity of attention. */
function LedgerHalf({
  groups,
  heading,
  byPerson = false,
  tourAnchor,
}: {
  groups: readonly (RosterGroup | RosterPersonGroup)[];
  heading: string;
  byPerson?: boolean;
  tourAnchor?: string;
}) {
  return (
    <div className="mt-12">
      <p
        data-desk-rest-head
        data-tour-anchor={tourAnchor}
        className="mb-4 border-t border-[color:var(--doc-ink-border)] pt-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-subtle)]"
      >
        {heading}
      </p>
      {groups.map((group) => (
        <div key={group.key} className="mb-8 last:mb-0">
          <h3
            id={byPerson ? `roster-${group.key}` : `roster-stage-${group.key}`}
            data-person-plate={byPerson ? group.key : undefined}
            data-stage-tab={byPerson ? undefined : group.key}
            className={
              byPerson
                ? PERSON_PLATE_CLASS
                : `${STAGE_PLATE_CLASS} ${STAGE_TAB[(group as RosterGroup).key]}`
            }
          >
            {group.label} · {group.count}
          </h3>
          <ul>
            {group.lines.map((line) => (
              <DeskLedgerRow
                key={line.engagementId}
                line={line}
                tone={STAGE_TONE[line.stage]}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function DeskRoster({
  roster,
  studioMembers,
}: {
  roster: DeskRosterModel;
  studioMembers?: readonly RosterMember[];
}) {
  const settle = useSettleOnce();
  const [needsMe, setNeedsMe] = useState(false);
  const [byPerson, setByPerson] = useState(false);
  const { data: answeredNotes } = useAnsweredNotes();

  // One derivation for the whole Desk: the day's line, the cards and the
  // ledger are three views of it, so no line can name a job the grid does not
  // print and no count can disagree with what is on the page.
  const claims = useMemo(
    () =>
      deriveDeskClaims({
        roster,
        answeredNotes: answeredNotes ?? [],
        now: new Date(),
      }),
    [roster, answeredNotes],
  );

  const people = useMemo(
    () => deriveRosterPeople(studioMembers ?? []),
    [studioMembers],
  );

  // IA-11 — "Only what needs me" hides the ledger outright: the cards already
  // ARE what needs her, so narrowing them again would be a no-op that looked
  // like a filter.
  const showLedger = !needsMe && claims.ledger.length > 0;
  const cardGroups: ClaimPersonGroup[] = byPerson
    ? groupClaimsByPerson(claims.cards, people)
    : [];
  const ledgerGroups = byPerson
    ? groupRosterByPerson(claims.ledger, people)
    : claims.ledger;

  // The facet emptied the Desk — as against a Desk that has no live jobs at
  // all, which keeps its own sentence below.
  const facetEmpty =
    roster.groups.length > 0 &&
    claims.cards.length === 0 &&
    !showLedger &&
    (needsMe || byPerson);

  // The walkthrough's fourth stop must land on something in every state. It
  // prefers the first card; with no cards it falls to the at-rest head.
  const cardsAnchor = claims.cards.length > 0 ? 'desk-folio' : undefined;
  const ledgerAnchor = claims.cards.length === 0 ? 'desk-folio' : undefined;

  return (
    <section
      aria-labelledby="every-job"
      data-testid="desk-roster"
      data-tour-anchor="desk-needs-your-hand"
    >
      {/* The head row: the sentence left, the facets right, wrapping to a
          second line at 390 and still standing above the first card. */}
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <SectionEyebrow>
          <span id="every-job">
            {facetHeading(claims.heading, { needsMe, byPerson })}
          </span>
        </SectionEyebrow>
        {/* Labels never change with state (IX18) — `aria-pressed` carries it. */}
        <div className="-my-2 flex flex-wrap items-baseline gap-x-6">
          <FacetAct
            actionKey="roster-facet-needs-me"
            pressed={needsMe}
            onToggle={() => setNeedsMe((on) => !on)}
          >
            Only what needs me
          </FacetAct>
          {people.length > 0 && (
            <FacetAct
              actionKey="roster-facet-by-person"
              pressed={byPerson}
              onToggle={() => setByPerson((on) => !on)}
            >
              By person
            </FacetAct>
          )}
        </div>
      </div>
      <p className="doc-type-body mb-8 text-[var(--text-body)]">
        {roster.overdueLine}
      </p>

      {/* The day's line: it quotes the grid below it (D7), each line an act
          into a card already on the page, and NOTHING at all when nothing
          claims her hand. It sits above the grid at every width, which is what
          the 390 reflow asks for. */}
      {claims.dayLine && (
        <div
          data-desk-day-line
          className="mb-8 border-t border-[color:var(--doc-ink-border)] pt-3"
        >
          {claims.dayLine.lines.map((line) => (
            <p
              key={line.key}
              data-day-line={line.key}
              className="doc-type-body mb-3 text-[var(--text-body)] last:mb-0"
            >
              <DayLineText parts={line.parts} />
            </p>
          ))}
          {claims.dayLine.more && (
            <p className="doc-type-body mt-3 text-[var(--text-body)]">
              <a
                href={`#${claims.dayLine.more.anchorId}`}
                data-day-line-more
                aria-label={`and ${claims.dayLine.more.count} more below`}
                className={INLINE_ACT}
              >
                and {claims.dayLine.more.count} more below
              </a>
            </p>
          )}
        </div>
      )}

      {/* One region for the whole Desk: the acts are one ledger of acts, not N
          anonymous groups of one. */}
      <DocumentActionGroup
        surfaceKey="desk"
        regionKey="every-job"
        aria-label="Every job actions"
      >
        <div className="w-full">
          {facetEmpty ? (
            <p
              data-tour-anchor="desk-folio"
              data-roster-facet-empty
              className="font-heading text-[15px] italic text-[var(--text-muted)]"
            >
              {NOTHING_NEEDS_YOU}
            </p>
          ) : byPerson ? (
            <>
              {cardGroups.map((group, position) => (
                <div key={group.key} className="mb-8 last:mb-0">
                  {/* A person plate takes the rail, never a stage pigment:
                      people are not stages. */}
                  <h3
                    id={`roster-${group.key}`}
                    data-person-plate={group.key}
                    className={PERSON_PLATE_CLASS}
                  >
                    {group.label} · {group.count}
                  </h3>
                  <DeskClaimsGrid
                    cards={group.cards}
                    settle={settle}
                    startIndex={cardGroups
                      .slice(0, position)
                      .reduce((total, g) => total + g.count, 0)}
                    firstTourAnchor={position === 0 ? cardsAnchor : undefined}
                    id={position === 0 ? CLAIMS_ANCHOR_ID : undefined}
                  />
                </div>
              ))}
              {showLedger && (
                <LedgerHalf
                  groups={ledgerGroups}
                  heading={claims.restHeading}
                  byPerson
                  tourAnchor={ledgerAnchor}
                />
              )}
            </>
          ) : (
            <>
              <DeskClaimsGrid
                cards={claims.cards}
                settle={settle}
                firstTourAnchor={cardsAnchor}
                id={CLAIMS_ANCHOR_ID}
              />
              {showLedger && (
                <LedgerHalf
                  groups={ledgerGroups}
                  heading={claims.restHeading}
                  tourAnchor={ledgerAnchor}
                />
              )}
            </>
          )}
        </div>
      </DocumentActionGroup>

      {roster.groups.length === 0 && (
        <p
          data-tour-anchor="desk-folio"
          className="font-heading text-[15px] italic text-[var(--text-muted)]"
        >
          Nothing needs your hand. The work is in motion.
        </p>
      )}
    </section>
  );
}
```

> **Two anchors, never both.** `cardsAnchor` and `ledgerAnchor` are mutually exclusive by construction, and the `facetEmpty` and wholly-empty branches carry their own. A test asserting exactly one `[data-tour-anchor="desk-folio"]` in each of the four states is worth adding if the walkthrough ever starts matching more than the first.

- [ ] **Step 8: Run the suites to verify they pass**

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal test -- --ci \
  src/components/document/desk-roster.test.tsx \
  src/components/document/desk-roster-settle.test.tsx \
  src/components/document/desk-claim-card.test.tsx \
  src/components/document/desk-ledger-row.test.tsx \
  src/lib/document/__tests__/desk-focus-ring.test.ts \
  'src/app/(document)/desk/page.test.tsx'
```

Expected: 6 suites pass.

- [ ] **Step 9: Gate — the type-check must be GREEN, and the whole unit suite with it**

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal type-check
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal test -- --ci
```

Expected: type-check exits 0 — Task 4's redness is closed here and nowhere else. The full suite passes at or above Task 0's recorded baseline, plus this program's new suites.

- [ ] **Step 10: Commit**

```bash
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards add \
  apps/designer-portal/src/components/document/desk-roster.tsx \
  apps/designer-portal/src/components/document/desk-roster.test.tsx \
  apps/designer-portal/src/components/document/desk-roster-settle.test.tsx
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards commit -m "feat(desk): the Desk holds both halves" -- \
  apps/designer-portal/src/components/document/desk-roster.tsx \
  apps/designer-portal/src/components/document/desk-roster.test.tsx \
  apps/designer-portal/src/components/document/desk-roster-settle.test.tsx
```

Expected: 3 files.

---
## Task 8 (was 5): The e2e — a claim takes a card, a quiet job takes a row

**Which Playwright config you are in.** `apps/designer-portal/playwright.config.ts`, `testDir: e2e/`, three browser projects. Its `webServer.env` pins, **verbatim from the file**:

```
NEXT_PUBLIC_FLAG_OVERRIDES:
  'procurement-workspace-pilot:true,the-document-pilot:true,client-invite-letter:true'
```

That pinned value **beats `.env.local`** and reaches only a server Playwright starts itself. If a `pnpm dev` server is already running without those flags and `reuseExistingServer` picks it up, `/desk` redirects to `/portal` and every assertion below fails mysteriously. Kill any running dev server and let Playwright boot its own. Do not add a flag to `.env.local` and expect it to reach this suite.

**Waits.** No `page.waitForTimeout` — the ban is a documented convention and nothing enforces it (`e2e/.eslintrc.json` is unreachable under ESLint 9, and `eslint.config.mjs` ignores `e2e/**`). Use web-first `expect(...)` assertions with the `COLD` budget the sibling specs use.

**Fixture.** `seedWorkflowGateFixture()` (`e2e/helpers/workflow-gate-fixture.ts`) is the shared seed `wp3-screenshots.spec.ts` and the workflow specs already use; its `overdue` entry is a published, past-due gate — the seeded job that produces an `overdue_decision` need, and therefore the seeded Claim card. Do not add a second seed; the sibling specs share this one and a teardown here would pull it out from under a suite still running.

> **The fixture is synchronous.** `seedWorkflowGateFixture(): WorkflowGateIds` returns the ids directly, not a promise, and `wp3-screenshots.spec.ts` calls it from a plain `test.beforeAll(() => { ... })`. Match that. An `async` hook with an `await` on a non-promise would be noise that implies an asynchrony this helper does not have.

**Single-actor and shared-row.** This suite drives the one seeded designer and reads a per-studio surface. Pin chromium, as `wp3-screenshots.spec.ts` does — the three browser projects would otherwise run as the same seeded user and race each other.

**Files:**
- Create: `apps/designer-portal/e2e/document/desk-claims.spec.ts`
- Modify: `apps/designer-portal/e2e/wp3-screenshots.spec.ts`
- Modify: `apps/designer-portal/e2e/document/action-visibility.spec.ts`
- Modify: `apps/designer-portal/e2e/document/desk-error-state.spec.ts`

**Interfaces:**
- Consumes: the DOM contract Tasks 5–7 produced — `[data-claim-card]`, `[data-ledger-row]`, `[data-ledger-cell]`, `[data-register]`, `[data-claim-inert]`, `[data-desk-rest-head]`, `[data-tour-anchor="desk-folio"]`, `#desk-claims`, and the `At rest · N jobs` head.
- Produces: no code interfaces. Screenshots land in `docs/design/workflow-alignment/screenshots/wp3/`.

- [ ] **Step 1: Write the new e2e spec**

Create `apps/designer-portal/e2e/document/desk-claims.spec.ts`:

```ts
/**
 * R143 — the Desk in two halves.
 *
 * LOCAL STACK ONLY. Seeds the shared workflow-gate fixture, whose `overdue`
 * gate is the past-due decision that gives the seeded studio a job with a
 * claim on its hand.
 */
import { test, expect } from '../fixtures/auth';
import { seedWorkflowGateFixture } from '../helpers/workflow-gate-fixture';

const COLD = 30_000;

test.describe.configure({ mode: 'serial' });
// Single actor on a shared studio row: the three browser projects would run as
// the same seeded designer and race each other.
test.skip(({ browserName }) => browserName !== 'chromium', 'single seeded actor');

// Synchronous by design — seedWorkflowGateFixture returns ids, not a promise.
test.beforeAll(() => {
  seedWorkflowGateFixture();
});

test('a job with a claim takes a card; a quiet job takes a ledger row', async ({
  authenticatedPage: page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/desk', { waitUntil: 'domcontentloaded' });

  const roster = page.getByTestId('desk-roster');
  await expect(roster).toBeVisible({ timeout: COLD });

  const cards = roster.locator('[data-claim-card]');
  const rows = roster.locator('[data-ledger-row]');
  await expect(cards.first()).toBeVisible({ timeout: COLD });
  await expect(rows.first()).toBeVisible({ timeout: COLD });

  // No job is in both halves.
  const cardIds = await cards.evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-claim-card')),
  );
  const rowIds = await rows.evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-ledger-row')),
  );
  expect(cardIds.filter((id) => rowIds.includes(id))).toEqual([]);

  // The grid is where the day's line's more-link lands.
  await expect(page.locator('#desk-claims')).toHaveCount(1);

  // Every card carries exactly one act, named for its job.
  const firstAct = cards.first().locator('[data-action-key^="roster-"]');
  await expect(firstAct).toHaveCount(1);
  expect(await firstAct.getAttribute('aria-label')).toMatch(/ — .+$/);

  // The act's 44px floor rides the invisible halo the primitive renders last.
  await expect
    .poll(async () =>
      (await firstAct.locator('[data-action-hit]').boundingBox())?.height ?? 0,
    )
    .toBeGreaterThanOrEqual(44);

  // The at-rest half announces its count — a quantity of WORK, the one count
  // this surface permits.
  await expect(roster.locator('[data-desk-rest-head]')).toHaveText(
    /^At rest · \d+ jobs?$/,
  );

  // Nothing folds on first paint, in either half.
  await expect(roster.locator('[aria-expanded]')).toHaveCount(0);
  await expect(roster.locator('[hidden]')).toHaveCount(0);
});

test('D10 — the whole upper block is the card’s link zone', async ({
  authenticatedPage: page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/desk', { waitUntil: 'domcontentloaded' });

  const card = page.getByTestId('desk-roster').locator('[data-claim-card]').first();
  await expect(card).toBeVisible({ timeout: COLD });

  // The block is at least 88px — the sub-44px name link is the defect the card
  // exists to fix.
  const upper = card.locator('.desk-claim-upper');
  await expect
    .poll(async () => (await upper.boundingBox())?.height ?? 0)
    .toBeGreaterThanOrEqual(88);

  // A click landing on the person line reaches the name link, not the span:
  // the custody row and person line are pointer-events:none by ruling.
  const hitIsTheLink = await card.evaluate((el) => {
    const person = el.querySelector('[data-register="person"]') as HTMLElement | null;
    const link = el.querySelector('[data-roster-name]');
    if (!person || !link) return false;
    const box = person.getBoundingClientRect();
    const hit = document.elementFromPoint(
      box.left + box.width / 2,
      box.top + box.height / 2,
    );
    return hit === link || !!hit?.closest('[data-roster-name]');
  });
  expect(hitIsTheLink).toBe(true);

  // The sentence below the block keeps its pointer events and stays
  // selectable — that is the half of the trade-off R143 preserves.
  const sentenceIsItself = await card.evaluate((el) => {
    const sentence = el.querySelector('[data-register="sentence"]') as HTMLElement | null;
    if (!sentence) return false;
    const box = sentence.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + 8, box.top + box.height / 2);
    return !hit?.closest('[data-roster-name]');
  });
  expect(sentenceIsItself).toBe(true);
});

test('Only what needs me hides the ledger and leaves the cards', async ({
  authenticatedPage: page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/desk', { waitUntil: 'domcontentloaded' });

  const roster = page.getByTestId('desk-roster');
  await expect(roster.locator('[data-ledger-row]').first()).toBeVisible({
    timeout: COLD,
  });
  const cardsBefore = await roster.locator('[data-claim-card]').count();

  await roster.getByRole('button', { name: 'Only what needs me' }).click();

  await expect(roster.locator('[data-ledger-row]')).toHaveCount(0);
  await expect(roster.locator('[data-claim-card]')).toHaveCount(cardsBefore);
  // IX18 — the label never changes with state; aria-pressed carries it.
  await expect(
    roster.getByRole('button', { name: 'Only what needs me' }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('the Desk does not scroll sideways at 390', async ({
  authenticatedPage: page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/desk', { waitUntil: 'domcontentloaded' });

  const roster = page.getByTestId('desk-roster');
  await expect(roster.locator('[data-claim-card]').first()).toBeVisible({
    timeout: COLD,
  });

  // One column below 640: three columns at 390 is a 98px card, into which a
  // Playfair name cannot wrap without truncating, and truncation is banned.
  const widths = await roster
    .locator('[data-claim-card]')
    .evaluateAll((els) =>
      els.map((el) => Math.round(el.getBoundingClientRect().width)),
    );
  expect(new Set(widths).size).toBe(1);
  expect(widths[0]).toBeGreaterThan(280);

  await expect
    .poll(async () =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
});
```

- [ ] **Step 2: Run the new spec to verify it passes**

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal test:e2e -- \
  e2e/document/desk-claims.spec.ts --project=chromium
```

Expected: 4 passed. If `/desk` redirects to `/portal`, a dev server without the pinned flags was reused — kill it and rerun.

- [ ] **Step 3: Update `wp3-screenshots.spec.ts`**

The block to edit opens at **line 212** (`test('Desk roster — one line per job, and the one aggregate sentence')`) and its viewport loop opens at **line 215**.

(a) Rename the test:

```ts
test('Desk — cards for the claims, lines for the rest', async ({
```

(b) At line 215, extend the loop to the three readings the program asks for. Find:

```ts
  for (const [name, viewport] of [
    ['desktop', DESKTOP],
    ['mobile', MOBILE],
  ] as const) {
```

Replace with:

```ts
  for (const [name, viewport] of [
    ['desktop', DESKTOP],
    ['wide', { width: 1440, height: 1000 }],
    ['mobile', MOBILE],
  ] as const) {
```

(c) Replace the anchor comment. Find:

```ts
    // B2 — the folio grid and The studio today are one roster now. The first
    // job line still carries the `desk-folio` tour anchor, so the walkthrough's
    // fourth stop lands where it always did.
```

Replace with:

```ts
    // R143 — the roster is two halves now. The first CLAIM CARD carries the
    // `desk-folio` tour anchor (or, on a Desk with no claims, the at-rest
    // head), so the walkthrough's fourth stop lands where it always did.
```

(d) Replace the density-rule block. Find:

```ts
    // The density rule is the whole design: one line per job, never a card,
    // and nothing folded on first paint — no line hides behind a disclosure.
    const lines = roster.locator('[data-roster-line]');
    await expect(lines.first()).toBeVisible({ timeout: 30_000 });
    await expect(roster.locator('[aria-expanded]')).toHaveCount(0);
    await expect(roster.locator('[hidden]')).toHaveCount(0);

    // Stage headings, printed with their counts and never folded.
    await expect(roster.locator('h3').first()).toBeVisible();
```

Replace with:

```ts
    // R143's amended density rule: one line per job in the at-rest ledger, a
    // card for a job with a claim on the studio's hand — and nothing folded on
    // first paint in either half.
    await expect(roster.locator('[data-claim-card]').first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(roster.locator('[aria-expanded]')).toHaveCount(0);
    await expect(roster.locator('[hidden]')).toHaveCount(0);

    // Stage headings head the LEDGER half, and a Desk whose jobs all claim her
    // hand has no ledger and therefore no <h3> — so this asserts the plates
    // only where a ledger exists, rather than requiring one to.
    if ((await roster.locator('[data-ledger-row]').count()) > 0) {
      await expect(roster.locator('h3').first()).toBeVisible();
      await expect(roster.locator('[data-desk-rest-head]')).toBeVisible();
    }
```

(e) Add the program's shots after the existing `desk-roster-${name}.png` screenshot, inside the same loop:

```ts
    await page.locator('#desk-claims').scrollIntoViewIfNeeded();
    await page.locator('#desk-claims').screenshot({
      path: `${SHOT_DIR}/desk-claims-${name}.png`,
    });
```

(f) Verify no `never a card` string remains anywhere:

```bash
grep -rn "never a card" \
  /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards/apps/designer-portal
```

Expected: no output. (Task 7 already replaced the one in `desk-roster.tsx`'s header comment.)

- [ ] **Step 4: Update `action-visibility.spec.ts`**

In `test('desktop surfaces expose one legible primary per region')`, find:

```ts
    // One line per job, under a stage heading, and every line carries its own
    // act at a real 44px target.
    await expect(roster.locator('h3').first()).toBeVisible({ timeout: COLD });
    const firstLine = roster.locator('[data-roster-line]').first();
    await expect(firstLine).toBeVisible({ timeout: COLD });
    const rosterAction = firstLine.locator('[data-action-key^="roster-"]');
```

Replace with:

```ts
    // R143 — a card for a claim, a line for the rest. Both halves carry the
    // same one act per job at a real 44px target, and the region still elects
    // no leader.
    const firstCard = roster.locator('[data-claim-card]').first();
    await expect(firstCard).toBeVisible({ timeout: COLD });
    const rosterAction = firstCard.locator('[data-action-key^="roster-"]');
```

Immediately after the existing `await expectMinTarget(rosterAction);`, add:

```ts
    // The at-rest half's act is the same instrument at the same floor.
    const firstRow = roster.locator('[data-ledger-row]').first();
    await expect(firstRow).toBeVisible({ timeout: COLD });
    const ledgerAction = firstRow.locator('[data-action-key^="roster-"]');
    await expect(ledgerAction).toHaveCount(1, { timeout: COLD });
    await expect(ledgerAction).toContainText(ROSTER_ACTION, { timeout: COLD });
    await expectMinTarget(ledgerAction);
```

Then retarget the file's two other `[data-roster-line]` references:

```bash
grep -n "data-roster-line" \
  /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards/apps/designer-portal/e2e/document/action-visibility.spec.ts
```

- The one around **line 249** (inside the comment about the roster's lines only existing once React has run) → `'[data-claim-card], [data-ledger-row]'`.
- The one around **line 291**, inside a `test.fixme` whose owner note reads *"Un-fixme when: the roster line fits its own content box at 390"* → retarget the locator to `'[data-claim-card], [data-ledger-row]'` and **leave the fixme in place**. The new spec's own 390 assertion is what proves the reflow; un-fixme-ing another lane's deferred item is out of scope.

- [ ] **Step 5: Update `desk-error-state.spec.ts`**

This file asserts on `getByTestId('desk-roster')`, the `Every job` heading, and — at **line 104** — a `[data-roster-line]` count that no longer matches anything. Expect to change that one locator. Find:

```ts
      const jobLines = page.locator('[data-roster-line]');
```

Replace with:

```ts
      // R143 — the Desk's jobs are cards and ledger rows now; this assertion
      // is about "did any job render at all", so it counts both halves.
      const jobLines = page.locator('[data-claim-card], [data-ledger-row]');
```

Then run it:

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal test:e2e -- \
  e2e/document/desk-error-state.spec.ts --project=chromium
```

Expected: green. If it passes **without** the edit as well, keep the edit anyway — a locator matching nothing is a silently vacuous assertion, which is worse than a failing one.

- [ ] **Step 6: Run the four touched specs together**

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal test:e2e -- \
  e2e/document/desk-claims.spec.ts \
  e2e/document/action-visibility.spec.ts \
  e2e/document/desk-error-state.spec.ts \
  e2e/wp3-screenshots.spec.ts \
  --project=chromium
```

Expected: all pass; the shots exist under `docs/design/workflow-alignment/screenshots/wp3/` as `desk-claims-{desktop,wide,mobile}.png`.

- [ ] **Step 7: Compress the new screenshots before staging**

Docs history already carries 138 MB of PNGs. Guard the glob — an unmatched pattern makes `sips` fail on the literal string, which reads as a tooling error rather than "no shots were taken":

```bash
SHOTS=/Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards/docs/design/workflow-alignment/screenshots/wp3
for f in "$SHOTS"/desk-claims-*.png "$SHOTS"/desk-roster-*.png "$SHOTS"/desk-folio-*.png; do
  [ -f "$f" ] || continue
  sips -Z 1600 "$f" >/dev/null
done
ls -la "$SHOTS" | grep desk-
```

Expected: the desk shots listed, each meaningfully smaller than before. If the loop compresses nothing, no shots were written — go back to Step 6 rather than committing an empty change.

- [ ] **Step 8: Commit**

```bash
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards status --short
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards add \
  apps/designer-portal/e2e/document/desk-claims.spec.ts \
  apps/designer-portal/e2e/document/action-visibility.spec.ts \
  apps/designer-portal/e2e/document/desk-error-state.spec.ts \
  apps/designer-portal/e2e/wp3-screenshots.spec.ts \
  docs/design/workflow-alignment/screenshots/wp3
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards commit -m "test(desk): e2e — a claim takes a card, a quiet job takes a row" -- \
  apps/designer-portal/e2e/document/desk-claims.spec.ts \
  apps/designer-portal/e2e/document/action-visibility.spec.ts \
  apps/designer-portal/e2e/document/desk-error-state.spec.ts \
  apps/designer-portal/e2e/wp3-screenshots.spec.ts \
  docs/design/workflow-alignment/screenshots/wp3
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards show --stat HEAD
```

Run `git status --short` first and confirm nothing unexpected is staged — **never `git add -A`**.

---

## Task 9 (was 6): The full gate, the merge, the deploy, and the ship report

**Deploy authorization.** Kody authorized this deploy in advance, as ruling **D11** — *"Build, verify, ship to prod (rec); then Kody's signed-in walk."* The full chain is authorized without per-step re-asking. **Do not stop to ask.** This program touches no migrations, no edge functions and no services, so the chain is one portal deploy.

**Files:**
- Create: `artifacts/desk-cards-2026-09-09/ship/report.md`

**Interfaces:**
- Consumes: everything Tasks 1–8 produced.
- Produces: `desk-cards/build` merged to `main` and pushed; the designer portal live on Cloudflare Workers; the ship report.

- [ ] **Step 1: Run the full designer-portal gate**

Per the verification matrix: `type-check` is the real type gate here (the build sets `ignoreBuildErrors: true` and proves nothing about types); `lint` is meaningful because `apps/designer-portal/eslint.config.mjs` is the one working flat ESLint config in the repo.

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal type-check
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal test -- --ci
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal lint
```

Expected:
- `type-check`: exits 0, no output.
- `test`: green, at or above Task 0's recorded baseline plus this program's new suites.
- `lint`: **exactly the baseline Task 0 Step 6 recorded** — expected to be the two pre-existing I150 errors (`piece-room-save-gate.test.tsx:159:1` `import/first`, `use-commercial-documents.test.ts:930:8` `react-hooks/rules-of-hooks`), neither in a file this program touches. A third error is a regression; fix it before going further.

- [ ] **Step 2: Run the Desk e2e set once more against a clean server**

```bash
pnpm --dir /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  --filter @patina/designer-portal test:e2e -- \
  e2e/document/desk-claims.spec.ts \
  e2e/document/action-visibility.spec.ts \
  e2e/document/desk-error-state.spec.ts \
  e2e/document/desk-walkthrough.spec.ts \
  --project=chromium
```

`desk-walkthrough.spec.ts` is included because the walkthrough's fourth stop anchors on `[data-tour-anchor="desk-folio"]`, which Task 7 moved onto the first Claim card.

Expected: all pass. Record what was **not** covered: firefox and webkit were not run.

- [ ] **Step 3: Reconcile against `origin/main` and merge**

```bash
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards fetch origin main
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards log --oneline origin/main -1
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  merge-base --is-ancestor origin/main HEAD && echo UP-TO-DATE || echo BEHIND
```

If `BEHIND`, merge `origin/main` into `desk-cards/build` in the worktree and re-run Step 1 before proceeding. This program mints **no** migration, so there is no migration number to reconcile.

```bash
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards push origin desk-cards/build
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards push origin desk-cards/build:main
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  merge-base --is-ancestor desk-cards/build origin/main && echo MERGED || echo NOT-MERGED
```

Expected: `MERGED`. Paste that output — never claim a merge from memory or from the branch's existence. If the push to `main` is rejected as non-fast-forward, `origin/main` moved between the fetch and the push; refetch, merge, re-run Step 1, retry.

- [ ] **Step 4: Deploy the designer portal**

`./infra/deploy-portal.sh` is the **only** correct portal deploy path. Never `opennextjs-cloudflare build` or `wrangler deploy` from an app dir: the script's phase 1 rebuilds workspace-package dists first, and skipping it is how `TypeError: proposalTierVisibility is not a function` shipped to production from a stale `@patina/utils` dist.

Deploy from a checkout on the merged `main`. The shared checkout is 88 commits stale and dirty, so deploy from the worktree, which is now identical to `main`.

```bash
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards rev-parse HEAD
date -u +%Y-%m-%dT%H:%M:%SZ
bash /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards/infra/deploy-portal.sh designer
```

Expected: the script ends with `==> Done: designer portal deployed.` Record the HEAD sha and the start time — both go in the report.

- [ ] **Step 5: Verify the deploy landed**

The deployments list is **oldest-first** — read the **bottom** row. `/api/version` is not a freshness signal on the Workers path (it returns static defaults, since neither `deploy-portal.sh` nor `wrangler.jsonc` sets `APP_VERSION`/`BUILD_SHA`); it proves liveness only.

```bash
npx wrangler deployments list --name patina-designer-portal
```

Expected: the bottom row's timestamp is newer than the Step 4 start time.

**The freshness probe — where the new code actually is.** `desk-claim-card` is a **CSS class authored in `globals.css`**, not a JS identifier: it ships in Next's global stylesheet at `/_next/static/css/*.css`, which is linked from every page including the public sign-in page. It is not tree-shaken and not renamed. So the probe fetches a page that needs no session, reads its stylesheet links, and greps those:

```bash
BASE=https://patina-designer-portal.kody-be3.workers.dev

# (a) Liveness.
curl -s -o /dev/null -w 'version: %{http_code}\n' "$BASE/api/version"

# (b) The gate holds: a signed-out fetch of /desk does not serve the Desk.
curl -s -o /dev/null -w 'desk: %{http_code} %{redirect_url}\n' "$BASE/desk"

# (c) FRESHNESS — the served stylesheet carries the R143 classes.
#     Sign-in is public, so this needs no session.
curl -s "$BASE/auth/signin" \
  | grep -oE '/_next/static/css/[A-Za-z0-9_.-]+\.css' | sort -u > /tmp/desk-css.txt
echo "stylesheets found: $(wc -l < /tmp/desk-css.txt)"
test -s /tmp/desk-css.txt || echo "NO STYLESHEETS FOUND — the probe is inconclusive, not a pass"
while read -r sheet; do
  hits=$(curl -s "${BASE}${sheet}" \
    | grep -o 'desk-claim-card\|desk-ledger-row\|desk-claims-grid' | sort -u | tr '\n' ' ')
  [ -n "$hits" ] && echo "FOUND in ${sheet}: ${hits}"
done < /tmp/desk-css.txt
```

Expected: at least one `FOUND in /_next/static/css/…: desk-claim-card desk-claims-grid desk-ledger-row` line. If the sign-in path differs, take the route the signed-out `/desk` probe redirects to and use that.

**Second witness — the local build output.** The classes must be in the bundle the deploy uploaded, not only on the wire:

```bash
grep -rl 'desk-claim-card' \
  /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards/apps/designer-portal/.open-next/ \
  | head
```

Expected: at least one file. If the served stylesheet has the classes but the local build does not, you are probing a cached edge response — rerun the deploy. If the local build has them and the served stylesheet does not, the deploy did not land — rerun `deploy-portal.sh designer` and re-probe before writing the report.

```bash
npx wrangler tail patina-designer-portal
```

Watch ~60 seconds; expected: no new error spike.

- [ ] **Step 6: Write the ship report**

Create `artifacts/desk-cards-2026-09-09/ship/report.md` with real values and no paraphrase:

```markdown
# Desk Claim Cards — ship report (2026-09-09)

**What shipped.** R143 — the Desk is two halves: a Claim card for a job with a
claim on the studio's hand, an at-rest ledger row for the rest. R144 — one new
token, `--color-card-edge` / `--card-edge` #8F8C88, Claim cards only. D9's two
a11y fixes: the roster mark takes terracotta-ink and mocha; the Desk's focus
rings take clay-ink.

**Rulings delivered.** D1, D2, D3, D4, D4a, D5, D6, D7, D8, D9, D10, D11, R5.

**Commits.** <sha × 8, one line each>; merged to main at <sha>.

**Gates run, and their real output.**
- `type-check` — <verbatim>
- `test -- --ci` — <n suites / n tests>
- `lint` — <the errors, named; and whether they match the Task 0 baseline>
- `test:e2e -- <specs> --project=chromium` — <n passed>

**Deploy.** `./infra/deploy-portal.sh designer`, from main at <sha>, started <time>.
`wrangler deployments list` bottom row: <id> <timestamp>.

**Behaviour probes.**
- `/api/version` → <code> (liveness only).
- signed-out `/desk` → <code> <redirect>.
- served stylesheet → `FOUND in <sheet>: <classes>`.
- local `.open-next/` grep → <files>.
- `wrangler tail` 60s → <observed>.

**Owed copy fix (found in build, not fixed).** `deriveMotion`'s `with_client`
text reads "With client since 4 Aug" while the ledger's value column prints the
same date — the date shows twice on those rows. Editing that copy touches the
folio too, so it was left alone. Worth one line of Kody's ruling.

**Not verified.** <firefox/webkit e2e not run; the signed-in walk is Kody's per
D11; the 45-job density claim was not exercised against a seeded 45-job studio;
other portal surfaces still carry `--color-clay` focus rings — list the files.>

**Owed to Kody.** The signed-in prod walk of /desk at 1440 and 390 (D11).
```

- [ ] **Step 7: Commit and push the report**

```bash
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards add \
  artifacts/desk-cards-2026-09-09/ship/report.md
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards commit -m "docs(desk): ship report — Claim cards live on app.patina.cloud" -- \
  artifacts/desk-cards-2026-09-09/ship/report.md
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards push origin desk-cards/build:main
```

- [ ] **Step 8: Retire the worktree**

Mandatory, not optional — a 2026-07-29 sweep found 185 accumulated worktrees consuming tens of GB.

```bash
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards \
  merge-base --is-ancestor desk-cards/build origin/main && echo MERGED || echo NOT-MERGED
git -C /Users/kody/Code/patina-merged worktree remove /Users/kody/Code/patina-merged/.codex/worktrees/agent-desk-cards
git -C /Users/kody/Code/patina-merged branch -d desk-cards/build
git -C /Users/kody/Code/patina-merged worktree list
```

Remove only after `MERGED`. If `git worktree remove` reports the worktree is `locked`, run `git -C /Users/kody/Code/patina-merged worktree unlock <path>` first.

---

## Self-review

**Spec coverage — rulings D1–D11 + R5, each to a task.**

| Ruling | Where it lands |
|---|---|
| D1 Hybrid: cards on top, ledger rows beneath | T4 (`deriveDeskClaims`), T7 (composition) |
| D2 Replace, one rendering; no switcher; facets stay | T7 (`showLedger`, `groupClaimsByPerson` + `groupRosterByPerson`), T4 facet tests |
| D3 Rank by need, bands, oldest-first, tie on name, reason printed | T4 (`claimBand`, the sort, the undated-tie test), T5 (the sentence register) |
| D4 One boundary grey ~#8F8C88 | T2 |
| D4a Claim cards only; ledger keeps the hairline | T2 (R144 text), T5 (`.desk-ledger-row { background: transparent }`, no edge) |
| D5 `mark !== null` earns a card | T4, T7 composition test, T8 e2e |
| D6 Ten unowned kinds default to designer; custody word in code | T3 |
| D7 Day's line quotes the top three cards + the answered note | T4 (the wholesale replacement of 469–758, and the whole-roster answered search) |
| D8 At-rest ledger under the seven stage plates; the six columns incl. its date | T3 (`motionAnchorDate`, `valueText`), T4 (`ledger` grouping), T6 (`DeskLedgerRow`), T7 (`LedgerHalf`) |
| D9 Mark → ink pigments; focus ring → clay-ink; own commit, first | T1 |
| D10 88px upper block, act a full-width 44px band | T2 (R143's trade-off text), T5 (`pointer-events`), T5/T8 (the click-through assertions) |
| D11 Build, verify, ship to prod | T9, with the authorization stated |
| R5 Amend the two rules in writing, wave 1 | T2 (R143, R144) |

Also placed: the 390 reflow (T5 grid + the 639px band + T8's 390 test); forced-colors (T5, closing critic F9); the `.row-wash` reuse and the two-lit-targets suppression (T5); `.da-pool` act press (inherited unchanged from `DocumentAction`); reduced motion (globals.css's existing `prefers-reduced-motion` block covers `.row-wash` and `.row-wash-score`; the card and row add no new transition).

**Type consistency, checked across tasks.** `custodyWord(need, row)`, `motionAnchorDate(chip)`, `ClaimCard`, `ClaimBand`, `ClaimPersonGroup`, `DeskClaims`, `DeskClaimsInput`, `deriveDeskClaims`, `groupClaimsByPerson`, `CLAIMS_ANCHOR_ID`, `MAX_DAY_LINES` and the four new `RosterLine` fields (`custody`, `needOwner`, `valueText`, `motionText`) are declared once in T3/T4's Interfaces blocks and used with those exact names and types in T5–T8. `deriveDeskDayLine(cards, roster, answeredNotes, now)` has the same four-parameter shape in its declaration (T4 Interfaces), its implementation (T4 Step 4) and its caller (T7). `DeskDayLine.more` is `{ count, anchorId }` in all three. The components are `DeskClaimCard` / `DeskLedgerRow` / `DeskClaimsGrid` everywhere, deliberately distinct from the same-named types. `STAGE_TAB` / `STAGE_TONE` / `MARK_COLOR` / `rosterLineAnchorId` are declared once, in `desk-claim-card.tsx` (T5), and imported by T6 and T7 — never re-declared. **`DeskRosterModel`** is the pre-existing local alias for the exported `DeskRoster` *type* (`import { type DeskRoster as DeskRosterModel }`), kept so the component and the type can share a name across modules; it appears with that spelling in T7's Interfaces block, its full file, and the two component test files. The DOM contract — `[data-claim-card]`, `[data-ledger-row]`, `[data-ledger-cell]`, `[data-register]`, `[data-claim-inert]`, `[data-desk-rest-head]`, `#desk-claims` — is produced in T5/T6/T7 and consumed with identical spellings in their tests and T8's specs.

**Placeholder scan.** No `TBD`, no "similar to Task N", no "add appropriate error handling", no "write tests for the above". Every test step carries its assertions; every implementation step carries the code or the exact old→new strings. `desk-roster.tsx` is printed in full in T7 — no "unchanged except". The one place the plan offers a choice rather than a single answer is T5 Step 4's note on `order-2` vs two inert wrappers; it names the preferred form, names the arbiter (the register test), and both branches are fully specified.

**Spec items that could not be placed in a task, stated rather than smuggled:**

1. **D9's wider reading.** The ruling says "portal focus ring `--color-clay` → clay-ink"; the brief scoped it to `desk-roster.tsx`'s two sites. Six other portal files still spend `--color-clay` as a focus ring (`(document)/doc/[id]/page.tsx`, three `scope-builder` components, `.da-glyph-btn` in `globals.css`). T1 fixes the Desk's, and the source-scan guard holds only the four Desk files; the rest are named in the ship report as a known, unfixed defect.
2. **The 45-job density claim.** The proposal argues ~6 cards over 39 rows at 45 jobs. The local seed has no 45-job studio and this program adds no fixture for one; T8 proves the split and the reflow, not the density at scale.
3. **`deriveMotion`'s duplicated date.** `with_client`'s chip text already reads "With client since 4 Aug", so a ledger row shows that date in prose and again in the value column. Fixing the copy would touch the folio, which renders the same chips — out of scope, and recorded in the ship report as owed.
4. **Four of the five motion→date mappings originally proposed are need kinds, not motion kinds.** `po_unacknowledged`, `po_unsent`, `new_lead` and `task_due` are `NeedKind`s: under D5 they always produce **cards**, never ledger rows, so a ledger date column can never read them. T3's table therefore maps the three `MotionKind`s that genuinely carry a date on `document_state` (`with_client`, `sent_unopened`, `drafting`) and nulls the other nine. This is the honest reachable form of D8's date column.
5. **`folder-card.tsx` and `desk-folio-preview.test.tsx`** stay in place, orphaned, per the brief. Not in scope.
